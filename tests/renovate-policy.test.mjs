import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { engine, resolveCandidate } from '../scripts/renovate-engine.mjs';

const { applyPackageRules } = await engine('util/package-rules/index.js');
const { mergeChildConfig } = await engine('config/utils.js');
const { getConfig: getDefaultConfig } = await engine('config/defaults.js');
const read = file => JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
const standard = await resolveCandidate(read('standard.json'));
const maintenance = await resolveCandidate(read('maintenance.json'));
async function effective(base, depName, updateType, manager = 'npm') {
  return applyPackageRules({ ...base, depName, packageName: depName, updateType, manager, datasource: manager === 'npm' ? 'npm' : 'github-tags' });
}

test('first-party majors and patches bypass delays within the same ten-slot capacity', async () => {
  for (const name of ['cms-field-vocabulary', 'ui-design-brain', '@verndale/ui-design-brain']) {
    for (const type of ['major', 'patch']) {
      const rule = await effective(standard, name, type);
      assert.deepEqual(rule.schedule, []);
      assert.equal(rule.minimumReleaseAge, null);
      assert.equal(rule.dependencyDashboardApproval, false);
      assert.equal(rule.groupName, null);
      assert.equal(rule.prPriority, 10);
      assert.equal(rule.prHourlyLimit, 0);
      assert.equal(rule.prConcurrentLimit, 10);
      assert.equal(rule.branchConcurrentLimit, 10);
      assert.equal(rule.automerge, false);
    }
  }
});

test('ordinary versions age; majors require approval; digest/pins are scheduled without age claims', async () => {
  for (const manager of ['npm', 'github-actions']) {
    for (const type of ['major', 'minor', 'patch', 'pin', 'pinDigest', 'digest', 'rollback', 'replacement']) {
      const rule = await effective(standard, 'third-party', type, manager);
      assert.deepEqual(rule.schedule, ['* * * * 1']);
      assert.equal(rule.minimumReleaseAgeBehaviour, 'timestamp-required');
      if (['major', 'minor', 'patch'].includes(type)) assert.equal(rule.minimumReleaseAge, '7 days');
      else assert.equal(rule.minimumReleaseAge ?? null, null);
      if (['major', 'rollback', 'replacement'].includes(type)) {
        assert.equal(rule.groupName, null);
        assert.equal(rule.dependencyDashboardApproval, true);
      } else assert.ok(rule.groupName);
    }
  }
  assert.equal(standard['github-actions'].pinDigests, true);
});

test('only publishers inherit release markers; Dependabot owns live security production', async () => {
  assert.equal(standard.commitMessageSuffix, undefined);
  assert.equal(maintenance.commitMessageSuffix, '[skip release]');
  assert.equal(maintenance.rangeStrategy, 'pin');
  for (const config of [standard, maintenance]) {
    assert.equal(config.vulnerabilityAlerts.enabled, false);
    assert.equal(config.osvVulnerabilityAlerts, false);
    // The pinned engine applies vulnerabilityAlerts as force; exercise that final override.
    const ordinary = await effective(config, 'third-party', 'major');
    const security = mergeChildConfig(ordinary, { ...config.vulnerabilityAlerts, enabled: true });
    assert.deepEqual(security.schedule, []);
    assert.equal(security.minimumReleaseAge, null);
    assert.equal(security.dependencyDashboardApproval, false);
    assert.equal(security.groupName, null);
    assert.equal(security.prCreation, 'immediate');
    assert.equal(security.automerge, false);
  }
  assert.equal(maintenance.vulnerabilityAlerts.commitMessageSuffix, '[SECURITY] [skip release]');
});

test('legacy default remains an independent npm-only first-party allowlist', async () => {
  const legacy = await resolveCandidate(read('default.json'));
  assert.deepEqual(legacy.enabledManagers, ['npm']);
  assert.equal((await effective(legacy, 'third-party', 'patch')).enabled, false);
  assert.equal((await effective(legacy, 'ui-design-brain', 'major')).enabled, true);
});

test('declared consumer samples preserve owned coverage and exclusions', async () => {
  const fixtures = read('tests/fixtures/consumers.json');
  assert.deepEqual(read('renovate.json'), fixtures['renovate-config']);
  for (const [name, config] of Object.entries(fixtures)) {
    const resolved = await resolveCandidate(config);
    assert.equal(resolved.automerge, false, name);
    assert.equal(resolved.vulnerabilityAlerts.enabled, false, name);
    assert.equal(resolved.osvVulnerabilityAlerts, false, name);
    if (name === 'ai-orchestration') {
      assert.equal(resolved.lockFileMaintenance.enabled, false);
      assert.deepEqual(resolved.ignoreDeps, ['@verndale/accessibility-standards', '@verndale/ui-design-brain', '@optimizely/cms-sdk']);
    } else {
      assert.equal(resolved.lockFileMaintenance.enabled, true, name);
      assert.deepEqual(resolved.lockFileMaintenance.schedule, ['* * * * 1'], name);
    }
    if (name === 'migrator') {
      assert.ok(resolved.ignorePaths.includes('templates/**'));
      assert.ok(resolved.enabledManagers.includes('pip_requirements'));
      for (const dep of ['xlsx', '@optimizely/cms-cli', '@optimizely/cms-sdk']) assert.ok(resolved.ignoreDeps.includes(dep));
    }
  }
  assert.deepEqual(getDefaultConfig().ignorePaths.filter(x => !fixtures.migrator.ignorePaths.includes(x)), []);
});

test('the pinned managers extract nested npm manifests, tooling requirements and reusable workflow pins', async () => {
  const os = await import('node:os');
  const { GlobalConfig } = await engine('config/global.js');
  const { filterIgnoredFiles, getMatchingFiles } = await engine('workers/repository/extract/file-match.js');
  const npm = await engine('modules/manager/npm/extract/index.js');
  const actions = await engine('modules/manager/github-actions/extract.js');
  const pip = await engine('modules/manager/pip_requirements/extract.js');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-courier-extract-'));
  GlobalConfig.set({ localDir: temp });
  try {
    const manifests = ['package.json', 'web/brain/package.json', 'apps/companion/package.json', 'ui/package.json'];
    for (const file of manifests) {
      const content = JSON.stringify({ name: 'fixture', dependencies: { 'ui-design-brain': '1.0.0' } });
      fs.mkdirSync(path.dirname(path.join(temp, file)), { recursive: true });
      fs.writeFileSync(path.join(temp, file), content);
      const extracted = await npm.extractPackageFile(content, file, {});
      assert.ok(extracted.deps.some(dep => dep.depName === 'ui-design-brain'), file);
    }
    const fixtures = read('tests/fixtures/consumers.json');
    assert.deepEqual(filterIgnoredFiles(['package.json', 'templates/site/package.json', 'templates/site/pnpm-lock.yaml', 'templates/site/.github/workflows/ci.yml'], fixtures.migrator.ignorePaths), ['package.json']);
    const { getManagerConfig } = await engine('config/index.js');
    const migrator = mergeChildConfig(getDefaultConfig(), await resolveCandidate(fixtures.migrator));
    const pipConfig = getManagerConfig(migrator, 'pip_requirements');
    assert.deepEqual(getMatchingFiles(pipConfig, ['requirements-tooling.txt', 'requirements.txt', 'nested/requirements.txt', 'templates/site/requirements.txt']),
      ['nested/requirements.txt', 'requirements-tooling.txt', 'requirements.txt']);
    for (const file of ['requirements.txt', 'nested/requirements.txt']) {
      const dep = await applyPackageRules({ ...pipConfig, packageFile: file, depName: 'graphifyy' });
      assert.equal(dep.enabled, false, file);
    }
    assert.equal((await applyPackageRules({ ...pipConfig, packageFile: 'requirements-tooling.txt', depName: 'graphifyy' })).enabled, true);
    assert.ok(pip.extractPackageFile('graphifyy[sql]==0.9.36\n').deps.some(dep => dep.depName === 'graphifyy'));
    const workflow = `name: Fixture\non: workflow_dispatch\njobs:\n  run:\n    uses: JFusco/renovate-config/.github/workflows/renovate-run.yml@${'a'.repeat(40)} # v1.0.0\n`;
    const extracted = await actions.extractPackageFile(workflow, '.github/workflows/renovate.yml', {});
    assert.ok(extracted.deps.some(dep => dep.depName === 'JFusco/renovate-config' && dep.currentDigest === 'a'.repeat(40)));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
