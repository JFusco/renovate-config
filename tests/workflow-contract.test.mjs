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
  const action = job.steps.find(step => step.name === 'Run pinned Renovate');
  assert.equal(action.uses, 'renovatebot/github-action@1c0cf989c02653fba0efe7ca5772338860ca71dc');
  assert.equal(action.with.configurationFile, 'pin-courier-config/runner.generated.json');
  assert.equal(release.renovateVersion, '44.190.0');
  assert.equal(action.with['renovate-version'], release.renovateVersion);
  assert.equal(JSON.stringify(action).includes('PRIVATE_KEY'), false);
  const companion = job.steps.at(-1);
  assert.equal(companion.name, 'Reconcile companion issues');
  assert.equal(companion.run, 'node pin-courier-config/scripts/run-companion-issues.cjs');
  assert.equal(companion.if, "${{ !cancelled() && steps.token.outcome == 'success' && vars.PIN_COURIER_COMPANIONS_ENABLED == 'true' }}");
  assert.deepEqual(companion.env, { INPUT_TARGET: '${{ inputs.target }}', CALLER_PRIVATE: '${{ github.event.repository.private }}',
    GH_TOKEN: '${{ steps.token.outputs.token }}' });
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

test('self-canary W/C pairing leaves every other caller on its existing release', () => {
  const pairing = JSON.parse(fs.readFileSync(path.join(root, 'workflow-release.json')));
  assert.equal(pairing.configurationCommit, release.configurationCommit);
  assert.equal(pairing.version, release.version);
  assert.match(pairing.workflowCommit, /^[a-f0-9]{40}$/);
  const expectedUses = `JFusco/renovate-config/.github/workflows/renovate-run.yml@${pairing.workflowCommit}`;
  const baselineUses = 'JFusco/renovate-config/.github/workflows/renovate-run.yml@c13f985540c9c23527aede87836eb08c285548f1';
  const baselineConfiguration = '9c1895a7fe84e2de36b2a409eaae04071b9dff0b';
  const coordinator = parse(fs.readFileSync(path.join(root, '.github/workflows/renovate.yml'), 'utf8'));
  const { PUBLIC_TARGETS, PRIVATE_TARGETS } = createRequire(import.meta.url)('../scripts/runner-profile.cjs');
  assert.deepEqual(Object.keys(coordinator.jobs), ['canary', 'renovate', 'forward-migrator', 'forward-ai-orchestration']);
  assert.equal(coordinator.jobs.canary.uses, expectedUses);
  assert.deepEqual(coordinator.jobs.canary.with, { target: 'JFusco/renovate-config' });
  assert.deepEqual(coordinator.jobs.canary.secrets, coordinator.jobs.renovate.secrets);
  assert.deepEqual(coordinator.jobs.renovate.with, { target: '${{ matrix.target }}' });
  assert.deepEqual(coordinator.jobs.renovate.strategy.matrix.target, PUBLIC_TARGETS.filter(target => target !== 'JFusco/renovate-config'));
  assert.equal(coordinator.jobs.renovate.strategy['fail-fast'], false);
  assert.equal(coordinator.jobs.renovate.uses, baselineUses);
  assert.equal(coordinator.jobs.renovate.if, "github.event_name != 'workflow_dispatch' || !inputs.canary_only");
  assert.deepEqual(coordinator.on.workflow_dispatch.inputs.canary_only,
    { description: 'Run only the renovate-config companion canary', required: false, default: false, type: 'boolean' });
  assert.deepEqual(coordinator.permissions, { contents: 'read' });
  assert.equal(coordinator.concurrency['cancel-in-progress'], false);
  assert.notEqual(coordinator.concurrency.group, workflow.jobs.renovate.concurrency.group);
  assert.deepEqual(coordinator.on.schedule, [{ cron: '23 */6 * * *' }]);
  assert.deepEqual(coordinator.on.repository_dispatch.types, ['package-released']);
  const callers = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/private-callers.json')));
  assert.deepEqual(Object.keys(callers), PRIVATE_TARGETS);
  for (const [target, yaml] of Object.entries(callers)) {
    const caller = parse(yaml);
    assert.deepEqual(caller.permissions, { contents: 'read' });
    assert.deepEqual(caller.on.schedule, [{ cron: '23 6 * * *' }]);
    assert.deepEqual(caller.on.repository_dispatch.types, ['package-released']);
    assert.equal(caller.concurrency['cancel-in-progress'], false);
    assert.equal(caller.jobs.renovate.if, "vars.PIN_COURIER_ENABLED == 'true' && github.event.repository.private == true");
    assert.equal(caller.jobs.renovate.uses, baselineUses);
    assert.deepEqual(caller.jobs.renovate.with, { target });
    assert.deepEqual(caller.jobs.renovate.secrets, coordinator.jobs.renovate.secrets);
    assert.match(yaml, /# v1\.0\.0/);
  }
  for (const target of PRIVATE_TARGETS) {
    const job = coordinator.jobs[`forward-${target.split('/')[1]}`];
    assert.equal(job.needs, undefined);
    assert.equal(job.if, "github.event_name == 'repository_dispatch' && github.event.action == 'package-released'");
    assert.equal(job.steps[0].with.ref, baselineConfiguration);
    assert.equal(job.steps[0].with.repository, 'JFusco/renovate-config');
    assert.equal(job.steps[0].with['persist-credentials'], false);
    const token = job.steps.find(step => step.id === 'token');
    assert.equal(token.uses, tokenAction);
    assert.equal(token.with.owner, 'verndale');
    assert.equal(token.with.repositories, target.split('/')[1]);
    assert.deepEqual(Object.keys(token.with).filter(k => k.startsWith('permission-')), ['permission-contents']);
    assert.equal(token.with['permission-contents'], 'write');
    assert.equal(job.steps.at(-1).env.DISPATCH_DESTINATION, target);
    assert.equal(job.steps.at(-1).run, 'node pin-courier-config/scripts/forward-release.cjs');
    assert.equal(JSON.stringify(job).includes('client_payload'), false);
  }
});

test('canary pins resolve to reviewed immutable commits and only self is admitted', () => {
  const pairing = JSON.parse(fs.readFileSync(path.join(root, 'workflow-release.json')));
  const show = file => {
    const result = spawnSync('git', ['show', file], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const policy = JSON.parse(show(`${pairing.configurationCommit}:companion-issues.json`));
  assert.deepEqual(Object.keys(policy.targets), ['JFusco/renovate-config']);
  assert.ok(Number.isFinite(Date.parse(policy.targets['JFusco/renovate-config'].startedAt)));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'companion-issues.json'))), policy);
  assert.deepEqual(parse(show(`${pairing.workflowCommit}:.github/workflows/renovate-run.yml`)), workflow);
  assert.deepEqual(JSON.parse(show(`${pairing.workflowCommit}:workflow-configuration.json`)), release);
  for (const [ancestor, descendant] of [[pairing.configurationCommit, pairing.workflowCommit], [pairing.workflowCommit, 'HEAD']]) {
    const result = spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: root });
    assert.equal(result.status, 0, 'C, W and caller promotion must preserve their reviewed ancestry');
  }
});
