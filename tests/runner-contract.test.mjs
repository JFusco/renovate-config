import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PUBLIC_TARGETS, PRIVATE_TARGETS, CATALOG_COMMANDS, validateTarget, generateProfile } = require('../scripts/runner-profile.cjs');
const { forwardedPayload } = require('../scripts/forward-release.cjs');
const base = JSON.parse(fs.readFileSync(new URL('../runner.json', import.meta.url)));
const context = target => ({ caller: 'JFusco/renovate-config', ref: 'refs/heads/main', target, privateRepository: false });

test('public coordinator maps exactly six targets to scoped single-repository profiles', () => {
  assert.equal(PUBLIC_TARGETS.length, 6);
  for (const target of PUBLIC_TARGETS) {
    const result = validateTarget(context(target));
    assert.equal(`${result.owner}/${result.repository}`, target);
    const profile = generateProfile(base, context(target));
    assert.deepEqual(profile.repositories, [target]);
    assert.equal(profile.autodiscover, false);
    assert.equal(profile.onboarding, false);
    assert.equal(profile.requireConfig, 'required');
    assert.equal(profile.allowScripts, false);
    assert.equal(profile.platformCommit, 'enabled');
    assert.deepEqual(profile.allowedCommands, target === 'JFusco/design-passport' ? CATALOG_COMMANDS : []);
  }
});

test('private callers must remain private, select only themselves, and execute on main', () => {
  for (const target of PRIVATE_TARGETS) {
    const privateContext = { ...context(target), caller: target, privateRepository: true };
    assert.deepEqual(generateProfile(base, privateContext).repositories, [target]);
    assert.deepEqual(generateProfile(base, privateContext).allowedCommands, []);
    for (const invalid of [context(target), { ...privateContext, privateRepository: false },
      { ...privateContext, target: 'JFusco/brain' }, { ...privateContext, ref: 'refs/heads/other' }]) assert.throws(() => validateTarget(invalid));
  }
  for (const caller of ['JFusco/brain', 'attacker/project']) assert.throws(() => validateTarget({ ...context('JFusco/brain'), caller }));
  assert.throws(() => validateTarget(context('JFusco/unlisted')));
});

test('untrusted release payloads cannot select repositories, refs or commands', () => {
  assert.deepEqual(forwardedPayload({}), { event_type: 'package-released' });
  const payload = forwardedPayload({ client_payload: { publisher: 'JFusco/ui-design-brain', package: 'ui-design-brain', version: '1.0.0',
    revision: 'a'.repeat(40), release_url: 'https://example.invalid', repository: 'attacker/project', configurationFile: '/tmp/evil', commands: ['bad'] } });
  assert.deepEqual(Object.keys(payload.client_payload), ['publisher', 'package', 'version', 'revision', 'release_url']);
  assert.deepEqual(generateProfile(base, { ...context('JFusco/brain'), ...payload }).repositories, ['JFusco/brain']);
});

test('the two anchored catalog commands reject shell suffixes and alternate installs', () => {
  const patterns = CATALOG_COMMANDS.map(value => new RegExp(value));
  for (const command of ['pnpm install', 'pnpm install --frozen-lockfile', 'pnpm catalog:sync; echo bad', 'pnpm catalog:sync && bad']) {
    assert.equal(patterns.some(pattern => pattern.test(command)), false);
  }
});
