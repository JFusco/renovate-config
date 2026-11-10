'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateTarget } = require('./runner-profile.cjs');
const { github } = require('./companion-github.cjs');
const { reconcile } = require('./companion-issues.cjs');

async function main(policy = JSON.parse(fs.readFileSync(path.join(__dirname, '../companion-issues.json'), 'utf8'))) {
  const { target } = validateTarget({ caller: process.env.GITHUB_REPOSITORY, target: process.env.INPUT_TARGET,
    ref: process.env.GITHUB_REF, privateRepository: process.env.CALLER_PRIVATE === 'true' });
  const activation = policy.targets[target];
  if (!activation) { console.log('Companion issues inactive for this target.'); return; }
  const result = await reconcile(github(target, process.env.GH_TOKEN), target, activation.startedAt);
  // Never emit private PR metadata in public coordinator logs.
  console.log(`Companion reconciliation: ${result.processed.length} processed; ${result.failures.length} require attention.`);
  // Validation keeps private targets in their own private caller's logs.
  for (const failure of result.failures) console.error(`PR #${failure.pr}: ${failure.error}`);
  if (result.failures.length) throw new Error('Companion reconciliation incomplete; inspect target records before retrying writes');
}
if (require.main === module) main().catch(() => { console.error('Companion reconciliation failed; no automatic replay of uncertain creates.'); process.exitCode = 1; });
module.exports = { main };
