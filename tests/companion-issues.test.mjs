import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { reconcile, marker, officeMarker, pending, linked, qualified, issueBody } = require('../scripts/companion-issues.cjs');
const { github } = require('../scripts/companion-github.cjs');
const repo = 'JFusco/brain', started = '2026-11-01T00:00:00Z';
const actor = { login: 'pin-courier[bot]', id: 351979519 };
test('inactive CLI exits before using credentials or calling GitHub', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./scripts/run-companion-issues.cjs').main({ targets: {} })"], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', env: {
      PATH: process.env.PATH, GITHUB_REPOSITORY: 'verndale/migrator', INPUT_TARGET: 'verndale/migrator',
      GITHUB_REF: 'refs/heads/main', CALLER_PRIVATE: 'true',
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /inactive/);
});
function fixture(repository = repo) {
  const pr = { number: 32, html_url: `https://github.com/${repository}/pull/32`, state: 'open', created_at: started,
    user: actor, head: { ref: 'renovate/npm', repo: { full_name: repository } }, base: { ref: 'main' } };
  const issues = [], comments = [], events = [], writes = [];
  const api = {
    async all(route) {
      if (route.startsWith('pulls?')) return [pr];
      if (route.startsWith('issues?')) return [...issues];
      if (route.includes('/comments?')) return [...comments];
      if (route.includes('/events?')) return [...events];
      throw Error(route);
    },
    async get(route) { return route.startsWith('pulls/') ? { ...pr } : { ...issues.find(i => i.number === Number(route.split('/')[1])) }; },
    async write(method, route, body) {
      writes.push({ method, route, body });
      if (method === 'POST' && route === 'issues') {
        const issue = { ...body, number: 81, node_id: 'issue', html_url: `https://github.com/${repository}/issues/81`, state: 'open', user: actor };
        issues.push(issue); return issue;
      }
      if (method === 'POST' && route.endsWith('/comments')) {
        const comment = { id: 91, ...body, user: actor }; comments.push(comment); return comment;
      }
      if (route.startsWith('issues/comments/')) { Object.assign(comments.find(c => c.id === Number(route.split('/')[2])), body); return {}; }
      Object.assign(issues.find(i => i.number === Number(route.split('/')[1])), body);
      events.push({ event: body.state === 'open' ? 'reopened' : 'closed', actor });
      return {};
    },
  };
  return { pr, issues, comments, events, writes, api, run: () => reconcile(api, repository, started) };
}

test('one issue and persistent link survive repeated reconciliation and PR body rewrites', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(), { processed: [32], failures: [] });
  assert.equal(f.issues.length, 1); assert.equal(f.comments.length, 1);
  assert.equal(f.comments[0].body, linked(repo, 32, 81));
  assert.ok(f.issues[0].body.includes(marker(repo, 32)));
  const before = f.writes.length;
  f.pr.body = 'Renovate regenerated this body';
  assert.deepEqual(await f.run(), { processed: [32], failures: [] });
  assert.equal(f.writes.length, before);
  assert.equal(f.pr.body, 'Renovate regenerated this body');
});

test('existing Office issue is reused without changing its body, assignment or lifecycle', async () => {
  const f = fixture();
  const existing = { number: 81, html_url: `https://github.com/${repo}/issues/81`, state: 'open',
    user: { login: 'JFusco', id: 486049 }, assignees: [{ login: 'JFusco' }], body: `Original\n${officeMarker(32)}` };
  f.issues.push(existing); const original = structuredClone(existing);
  f.pr.state = 'closed'; f.pr.merged_at = started;
  assert.equal((await f.run()).failures.length, 0);
  assert.deepEqual(existing, original);
  assert.ok(f.writes.every(w => w.route.includes('comments')));
});

test('merged, unmerged closed and reopened PRs reuse one bot-owned issue', async () => {
  for (const merged of [false, true]) {
    const f = fixture(); await f.run();
    f.pr.state = 'closed'; f.pr.merged_at = merged ? started : null;
    assert.equal((await f.run()).failures.length, 0);
    assert.equal(f.issues[0].state_reason, merged ? 'completed' : 'not_planned');
    f.pr.state = 'open'; f.pr.merged_at = null;
    assert.equal((await f.run()).failures.length, 0);
    assert.equal(f.issues[0].state, 'open'); assert.equal(f.issues.length, 1);
  }
});

test('removing an existing Office assignment cannot cause a replacement issue', async () => {
  const f = fixture();
  f.issues.push({ number: 81, html_url: `https://github.com/${repo}/issues/81`, user: { login: 'JFusco', id: 486049 },
    assignees: [], body: officeMarker(32), state: 'open' });
  assert.match((await f.run()).failures[0].error, /assignment changed/);
  assert.equal(f.writes.length, 0); assert.equal(f.issues.length, 1);
});

test('a copied issue marker from another author is preserved but never trusted', async () => {
  const f = fixture();
  const copied = { number: 99, html_url: `https://github.com/${repo}/issues/99`, user: { login: 'attacker', id: 1 },
    body: marker(repo, 32), state: 'open' };
  f.issues.push(copied); const original = structuredClone(copied);
  assert.equal((await f.run()).failures.length, 0);
  assert.deepEqual(copied, original);
  assert.equal(f.comments[0].body, linked(repo, 32, 81));
});

test('ambiguous create is reconciled from the existing issue without another POST', async () => {
  const f = fixture(), write = f.api.write;
  f.api.write = async (...args) => { const r = await write(...args); if (args[1] === 'issues') throw Error('Transport lost'); return r; };
  assert.equal((await f.run()).failures.length, 1);
  f.api.write = write;
  assert.equal((await f.run()).failures.length, 0);
  assert.equal(f.writes.filter(w => w.route === 'issues').length, 1);
});

test('a durable pending intent with no issue never authorizes a second create', async () => {
  const f = fixture(); f.comments.push({ id: 91, user: actor, body: pending(repo, 32) });
  assert.match((await f.run()).failures[0].error, /pending creation/);
  assert.equal(f.writes.length, 0);
});

test('duplicates, edited comments and human lifecycle overrides preserve records', async () => {
  for (const scenario of ['duplicate', 'comment', 'closed', 'reopened']) {
    const f = fixture(); await f.run(); f.writes.length = 0;
    if (scenario === 'duplicate') f.issues.push({ ...f.issues[0], number: 82, html_url: `https://github.com/${repo}/issues/82` });
    if (scenario === 'comment') f.comments[0].body += 'Human note';
    if (scenario === 'closed') { f.issues[0].state = 'closed'; f.events.push({ event: 'closed', actor: { login: 'JFusco', id: 486049 } }); }
    if (scenario === 'reopened') { f.pr.state = 'closed'; f.events.push({ event: 'reopened', actor: { login: 'JFusco', id: 486049 } }); }
    assert.equal((await f.run()).failures.length, 1, scenario);
    assert.equal(f.writes.length, 0, scenario);
  }
});

test('spoofed markers, forked PRs and wrong numeric authors never authorize writes', async () => {
  const f = fixture();
  for (const change of [{ user: { ...actor, id: 1 } }, { head: { ...f.pr.head, repo: { full_name: 'attacker/brain' } } }, { base: { ref: 'release' } }])
    assert.equal(qualified({ ...f.pr, ...change }, repo), false);
  f.pr.user = { ...actor, id: 1 };
  assert.deepEqual(await f.run(), { processed: [], failures: [] });
  assert.equal(f.writes.length, 0);
});

test('old closed PRs are excluded but future PRs closed between scans are tracked', async () => {
  const f = fixture(); f.pr.state = 'closed'; f.pr.created_at = '2020-01-01T00:00:00Z';
  assert.deepEqual(await f.run(), { processed: [], failures: [] });
  f.pr.created_at = started;
  assert.equal((await f.run()).processed.length, 1);
  assert.equal(f.issues[0].state_reason, 'not_planned');
});

test('historically closed Office PRs receive no backfill comments', async () => {
  const f = fixture(); f.pr.state = 'closed'; f.pr.created_at = '2020-01-01T00:00:00Z';
  f.issues.push({ number: 81, html_url: `https://github.com/${repo}/issues/81`, state: 'closed',
    user: { login: 'JFusco', id: 486049 }, assignees: [{ login: 'JFusco' }], body: officeMarker(32) });
  assert.deepEqual(await f.run(), { processed: [], failures: [] });
  assert.equal(f.writes.length, 0);
});

test('Migrator issues have no Office marker, assignment or merge authority', async () => {
  const f = fixture('verndale/migrator');
  assert.equal((await f.run()).failures.length, 0);
  assert.doesNotMatch(issueBody('verndale/migrator', f.pr), /office-|The Office/);
  assert.equal(f.issues[0].assignees, undefined);
  assert.ok(f.writes.every(w => !w.route.startsWith('pulls/')));
});

test('API follows all pages and refuses cross-host or cross-target token disclosure', async () => {
  const calls = [];
  const api = github(repo, 'fixture-token', async url => {
    calls.push(String(url)); const second = url.searchParams.get('page') === '2';
    return new Response(JSON.stringify([{ number: second ? 2 : 1 }]), { headers: second ? {} : { link: `<https://api.github.com/repos/${repo}/issues?state=all&page=2>; rel="next"` } });
  });
  assert.deepEqual(await api.all('issues?state=all'), [{ number: 1 }, { number: 2 }]);
  for (const route of ['https://evil.invalid/issues', 'https://api.github.com/repos/attacker/brain/issues', '../../user'])
    await assert.rejects(api.get(route), /escaped/);
  assert.equal(calls.length, 2);
});
