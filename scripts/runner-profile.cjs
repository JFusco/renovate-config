'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PUBLIC_TARGETS = Object.freeze(['JFusco/renovate-config', 'JFusco/ui-design-brain',
  'JFusco/cms-field-vocabulary', 'JFusco/brain', 'JFusco/design-passport', 'JFusco/the-office']);
const PRIVATE_TARGETS = Object.freeze(['verndale/migrator', 'verndale/ai-orchestration']);
const CATALOG_COMMANDS = Object.freeze(['^pnpm install --frozen-lockfile --ignore-scripts$', '^pnpm catalog:sync$']);

function validateTarget({ caller, target, ref, privateRepository }) {
  if (ref !== 'refs/heads/main') throw new Error('Pin Courier requires main execution.');
  const allowed = caller === 'JFusco/renovate-config' ? PUBLIC_TARGETS
    : PRIVATE_TARGETS.includes(caller) && privateRepository === true ? [caller] : [];
  if (!allowed.includes(target)) throw new Error('Caller/target combination is not authorized.');
  const [owner, repository] = target.split('/');
  return { owner, repository, target };
}

function generateProfile(base, context) {
  const { target } = validateTarget(context);
  return { ...base, autodiscover: false, onboarding: false, requireConfig: 'required',
    allowScripts: false, platformCommit: 'enabled', repositories: [target],
    allowedCommands: target === 'JFusco/design-passport' ? [...CATALOG_COMMANDS] : [] };
}

if (require.main === module) {
  const context = { caller: process.env.GITHUB_REPOSITORY, target: process.env.INPUT_TARGET,
    ref: process.env.GITHUB_REF, privateRepository: process.env.CALLER_PRIVATE === 'true' };
  const target = validateTarget(context);
  const base = JSON.parse(fs.readFileSync(path.join(__dirname, '../runner.json'), 'utf8'));
  fs.writeFileSync(path.join(__dirname, '../runner.generated.json'), JSON.stringify(generateProfile(base, context), null, 2) + '\n');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `owner=${target.owner}\nrepository=${target.repository}\n`);
}

module.exports = { PUBLIC_TARGETS, PRIVATE_TARGETS, CATALOG_COMMANDS, validateTarget, generateProfile };
