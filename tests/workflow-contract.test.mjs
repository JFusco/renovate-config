import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(process.env.RENOVATE_MODULE_PATH, 'package.json'));
const { parse } = require('yaml');
const workflow = parse(fs.readFileSync(path.join(root, '.github/workflows/renovate-run.yml'), 'utf8'));
const release = JSON.parse(fs.readFileSync(path.join(root, 'workflow-configuration.json')));
const tokenAction = 'actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510';

test('reusable interface cannot override trusted configuration or execution mode', () => {
  assert.deepEqual(Object.keys(workflow.on), ['workflow_call']);
  assert.deepEqual(workflow.on.workflow_call.inputs, { target: { required: true, type: 'string' } });
  assert.deepEqual(Object.keys(workflow.on.workflow_call.secrets).sort(), ['RENOVATE_APP_CLIENT_ID', 'RENOVATE_APP_PRIVATE_KEY']);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.match(release.configurationCommit, /^[a-f0-9]{40}$/);
  for (const job of Object.values(workflow.jobs)) {
    const checkout = job.steps[0];
    assert.equal(checkout.with.repository, 'JFusco/renovate-config');
    assert.equal(checkout.with.ref, release.configurationCommit);
    assert.equal(checkout.with.path, 'pin-courier-config');
    assert.equal(checkout.with['persist-credentials'], false);
  }
});

test('caller validation precedes token creation; grants and engine remain explicit', () => {
  const validation = workflow.jobs.validate;
  assert.ok(validation.steps.some(step => step.id === 'target' && step.run === 'node pin-courier-config/scripts/runner-profile.cjs'));
  assert.equal(JSON.stringify(validation).includes('secrets.'), false);
  const job = workflow.jobs.renovate;
  assert.equal(job.needs, 'validate');
  assert.equal(job.if, "needs.validate.outputs.active == 'true'");
  assert.equal(job['timeout-minutes'], 30);
  assert.equal(job.concurrency['cancel-in-progress'], false);
  assert.equal(job.concurrency.group, 'pin-courier-target-${{ inputs.target }}');
  const profileIndex = job.steps.findIndex(step => step.run === 'node pin-courier-config/scripts/runner-profile.cjs');
  const tokenIndex = job.steps.findIndex(step => step.id === 'token');
  assert.ok(profileIndex >= 0 && profileIndex < tokenIndex);
  for (const step of [validation.steps.find(step => step.id === 'target'), job.steps[profileIndex]]) {
    assert.deepEqual(step.env, { INPUT_TARGET: '${{ inputs.target }}', CALLER_PRIVATE: '${{ github.event.repository.private }}' });
  }
  const token = job.steps[tokenIndex];
  assert.equal(token.uses, tokenAction);
  assert.deepEqual(token.with, {
    'client-id': '${{ secrets.RENOVATE_APP_CLIENT_ID }}', 'private-key': '${{ secrets.RENOVATE_APP_PRIVATE_KEY }}',
    owner: '${{ needs.validate.outputs.owner }}', repositories: '${{ needs.validate.outputs.repository }}',
    'permission-contents': 'write', 'permission-issues': 'write', 'permission-pull-requests': 'write',
    'permission-workflows': 'write', 'permission-statuses': 'write', 'permission-checks': 'read',
    'permission-administration': 'read', 'permission-vulnerability-alerts': 'read',
  });
  const action = job.steps.at(-1);
  assert.equal(action.uses, 'renovatebot/github-action@2804199d260ad00c1fae0e9e842888369391c776');
  assert.equal(action.with.configurationFile, 'pin-courier-config/runner.generated.json');
  assert.equal(release.renovateVersion, '44.190.0');
  assert.equal(action.with['renovate-version'], release.renovateVersion);
  assert.equal(JSON.stringify(action).includes('PRIVATE_KEY'), false);
});

test('actual admission program stays paused by default and accepts only fixed public targets', () => {
  const run = workflow.jobs.validate.steps.find(step => step.id === 'admission').run;
  const script = run.match(/^node <<'JS'\n([\s\S]*)\nJS\n?$/)[1];
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-courier-admission-'));
  try {
    fs.symlinkSync(root, path.join(temp, 'pin-courier-config'), 'dir');
    for (const [caller, targets, flag, expected] of [
      ['JFusco/renovate-config', '[]', '', false],
      ['JFusco/renovate-config', '["JFusco/brain"]', '', true],
      ['JFusco/renovate-config', '["verndale/migrator"]', '', null],
      ['JFusco/renovate-config', '{}', '', null],
      ['verndale/migrator', '[]', '', false],
      ['verndale/migrator', '[]', 'true', true],
    ]) {
      const output = path.join(temp, 'output'); fs.writeFileSync(output, '');
      const result = spawnSync(process.execPath, ['-e', script], { cwd: temp, encoding: 'utf8', env: {
        PATH: process.env.PATH, GITHUB_REPOSITORY: caller, INPUT_TARGET: 'JFusco/brain', PUBLIC_TARGETS_JSON: targets,
        PRIVATE_ENABLED: flag, GITHUB_OUTPUT: output,
      } });
      assert.equal(result.status === 0, expected !== null);
      assert.equal(fs.readFileSync(output, 'utf8'), expected === null ? '' : `active=${expected}\n`);
    }
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
