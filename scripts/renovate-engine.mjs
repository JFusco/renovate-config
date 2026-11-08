import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const enginePath = process.env.RENOVATE_MODULE_PATH;
if (!enginePath) throw new Error('Set RENOVATE_MODULE_PATH to the installed renovate@44.190.0 directory.');
const metadata = JSON.parse(fs.readFileSync(path.join(enginePath, 'package.json'), 'utf8'));
if (metadata.version !== '44.190.0') throw new Error('Validation requires Renovate 44.190.0.');
export const engine = file => import(pathToFileURL(path.join(enginePath, 'dist', file)).href);
const { regexEngineStatus } = await engine('util/regex.js');
if (regexEngineStatus.type !== 'available') throw new Error('Native RE2 is required; fallback regex validation is not acceptance evidence.');

const { init } = await engine('logger/index.js');
await init();

const { mergeChildConfig } = await engine('config/utils.js');
const { resolveConfigPresets } = await engine('config/presets/index.js');
const root = path.resolve(import.meta.dirname, '..');
export async function resolveCandidate(config) {
  let resolved = {};
  for (const preset of config.extends || []) {
    const local = preset.match(/^github>JFusco\/renovate-config(?::(standard|maintenance))?$/);
    const inherited = local ? await resolveCandidate(JSON.parse(fs.readFileSync(path.join(root, `${local[1] || 'default'}.json`), 'utf8')))
      : (await resolveConfigPresets({ extends: [preset] })).config;
    resolved = mergeChildConfig(resolved, inherited);
  }
  const own = { ...config };
  delete own.extends;
  return mergeChildConfig(resolved, own);
}
