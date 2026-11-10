'use strict';

const BOT_ID = 351979519;
const OFFICE_TARGETS = new Set(['JFusco/brain', 'JFusco/cms-field-vocabulary']);
const bot = value => value?.user?.id === BOT_ID && value.user.login === 'pin-courier[bot]';
const marker = (repo, pr) => `<!-- pin-courier-companion:v1 ${repo}#${pr} -->`;
const officeMarker = pr => `<!-- office-pin-courier-pr:${pr} -->`;
const prUrl = (repo, pr) => `https://github.com/${repo}/pull/${pr}`;
const pending = (repo, pr) => `${marker(repo, pr)}\nStatus: pending-issue-create\n`;
const linked = (repo, pr, issue) => `${marker(repo, pr)}\nCompanion issue: https://github.com/${repo}/issues/${issue}\n`;

function qualified(pr, repo) {
  return Number.isSafeInteger(pr.number) && pr.number > 0 && bot(pr) &&
    ['open', 'closed'].includes(pr.state) &&
    pr.html_url === prUrl(repo, pr.number) && pr.head?.repo?.full_name === repo &&
    pr.head.ref?.startsWith('renovate/') && pr.base?.ref === 'main';
}
function existingIssues(issues, repo, pr) {
  return issues.filter(i => !i.pull_request && Number.isSafeInteger(i.number) && i.number > 0 &&
    i.html_url === `https://github.com/${repo}/issues/${i.number}` &&
    (bot(i) && String(i.body).includes(marker(repo, pr)) || OFFICE_TARGETS.has(repo) &&
      i.user?.id === 486049 && i.user.login === 'JFusco' &&
      String(i.body).includes(officeMarker(pr))));
}
function issueBody(repo, pr) {
  return [
    '## Summary', '', `Track review and delivery of Pin Courier PR #${pr.number}.`, '',
    '## Context', '', 'The dependency change already exists in the PR. This issue does not authorize merging it.', '',
    '## Details', '', `Existing PR: ${prUrl(repo, pr.number)}`, '',
    '## Expected Outcome', '', '**Acceptance Criteria**', '',
    '- Review the dependency change and required checks through the repository\'s existing delivery process.',
    '- Retain this issue identity through PR updates and record the final PR outcome.', '',
    '## Additional Notes', '', marker(repo, pr.number),
    ...(OFFICE_TARGETS.has(repo) ? [officeMarker(pr.number)] : []), '',
  ].join('\n');
}

async function reconcileOne(api, issues, repo, initial) {
  const number = initial.number;
  // Re-read before writing; PR descriptions are never used as authority.
  const pr = await api.get(`pulls/${number}`);
  if (!qualified(pr, repo)) throw new Error(`PR #${number} no longer qualifies`);
  const matches = existingIssues(issues, repo, number);
  if (matches.length > 1) throw new Error(`PR #${number} has multiple companion issues; preserve them for review`);
  let issue = matches[0];
  if (issue && !bot(issue) && !issue.assignees?.some(a => a.login === 'JFusco'))
    throw new Error(`PR #${number} Office tracking assignment changed; preserve its issue for reconciliation`);
  const comments = (await api.all(`issues/${number}/comments?per_page=100`))
    .filter(c => bot(c) && String(c.body).includes(marker(repo, number)));
  if (comments.length > 1) throw new Error(`PR #${number} has multiple companion comments`);
  let comment = comments[0];
  const expected = issue && linked(repo, number, issue.number);
  if (comment && comment.body !== pending(repo, number) && comment.body !== expected)
    throw new Error(`PR #${number} companion comment changed; preserve it for review`);
  if (!issue) {
    if (comment) throw new Error(`PR #${number} has pending creation; reconcile manually before another create`);
    comment = await api.write('POST', `issues/${number}/comments`, { body: pending(repo, number) });
    if (!bot(comment) || !Number.isSafeInteger(comment.id)) throw new Error('Unverified creation intent');
    const intent = await api.all(`issues/${number}/comments?per_page=100`);
    if (!intent.some(c => c.id === comment.id && bot(c) && c.body === pending(repo, number)))
      throw new Error('Creation intent did not read back');
    issue = await api.write('POST', 'issues', {
      title: `[Task] Review Pin Courier PR #${number}`, body: issueBody(repo, pr),
    });
    // Unknown create results are not resent. The pending comment survives the runner.
    const saved = await api.get(`issues/${issue.number}`);
    if (existingIssues([saved], repo, number).length !== 1 || !bot(saved))
      throw new Error('Created companion issue did not read back');
    issue = saved;
    issues.push(issue);
  }
  const body = linked(repo, number, issue.number);
  if (!comment) comment = await api.write('POST', `issues/${number}/comments`, { body });
  else if (comment.body !== body) await api.write('PATCH', `issues/comments/${comment.id}`, { body });
  const savedComments = await api.all(`issues/${number}/comments?per_page=100`);
  if (!savedComments.some(c => c.id === comment.id && bot(c) && c.body === body))
    throw new Error(`PR #${number} companion link did not read back`);
  // Existing Office records remain entirely Office-owned.
  if (!bot(issue)) return;
  const current = await api.get(`issues/${issue.number}`);
  if (existingIssues([current], repo, number).length !== 1 || !bot(current)) throw new Error('Issue ownership changed');
  const currentPr = await api.get(`pulls/${number}`);
  if (!qualified(currentPr, repo)) throw new Error('PR identity changed before lifecycle reconciliation');
  const wanted = currentPr.state === 'open' ? 'open' : 'closed';
  const reason = currentPr.merged_at ? 'completed' : 'not_planned';
  if (current.state === wanted && (wanted === 'open' || current.state_reason === reason)) return;
  const events = (await api.all(`issues/${issue.number}/events?per_page=100`))
    .filter(e => e.event === 'closed' || e.event === 'reopened');
  const last = events.at(-1);
  if (last && (last.actor?.id !== BOT_ID || last.actor.login !== 'pin-courier[bot]'))
    throw new Error(`Issue #${issue.number} has a human lifecycle override; preserve it`);
  await api.write('PATCH', `issues/${issue.number}`, {
    state: wanted, state_reason: wanted === 'open' ? 'reopened' : reason,
  });
  const saved = await api.get(`issues/${issue.number}`);
  if (saved.state !== wanted || wanted === 'closed' && saved.state_reason !== reason)
    throw new Error(`Issue #${issue.number} lifecycle did not read back`);
}

async function reconcile(api, repo, startedAt) {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start) || start > Date.now()) throw new Error('A valid activation timestamp is required');
  const issues = await api.all('issues?state=all&per_page=100');
  const pulls = await api.all('pulls?state=all&sort=created&direction=desc&per_page=100');
  const failures = [], processed = [];
  for (const pr of pulls.filter(p => qualified(p, repo))) {
    if (pr.state !== 'open' && !existingIssues(issues, repo, pr.number).some(bot)) {
      if (!Number.isFinite(Date.parse(pr.created_at))) { failures.push({ pr: pr.number, error: 'Missing creation date; historical scope unknown' }); continue; }
      if (Date.parse(pr.created_at) < start) continue;
    }
    try { await reconcileOne(api, issues, repo, pr); processed.push(pr.number); }
    catch (error) { failures.push({ pr: pr.number, error: error.message }); }
  }
  return { processed, failures };
}
module.exports = { reconcile, marker, officeMarker, qualified, existingIssues, issueBody, pending, linked };
