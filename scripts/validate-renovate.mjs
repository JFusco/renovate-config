import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { enginePath, resolveCandidate } from './renovate-engine.mjs';
const require = createRequire(import.meta.url);
const { generateProfile, PUBLIC_TARGETS, PRIVATE_TARGETS } = require('./runner-profile.cjs');
const root = path.resolve(import.meta.dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-courier-validation-'));
try {
  const configs = Object.fromEntries(await Promise.all(['default', 'standard', 'maintenance'].map(async name =>
    [name, await resolveCandidate(read(`${name}.json`))])));
  for (const [name, config] of Object.entries(read('tests/fixtures/consumers.json'))) configs[`consumer-${name}`] = await resolveCandidate(config);
  const run = (name, config, global) => {
    const file = path.join(temporary, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(config));
    const result = spawnSync(process.execPath, [path.join(enginePath, 'dist/config-validator.js'), '--strict', ...global ? [] : ['--no-global'], file], { cwd: temporary, env: process.env, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`${name} validation failed.`);
  };
  for (const [name, config] of Object.entries(configs)) run(name, config, false);
  const base = read('runner.json');
  run('runner', base, true);
  for (const target of [...PUBLIC_TARGETS, ...PRIVATE_TARGETS]) run(`profile-${target.replace('/', '-')}`, generateProfile(base,
    { target, caller: target.startsWith('verndale/') ? target : 'JFusco/renovate-config', privateRepository: target.startsWith('verndale/'), ref: 'refs/heads/main' }), true);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
