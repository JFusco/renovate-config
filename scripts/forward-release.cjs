'use strict';

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const DESTINATIONS = Object.freeze(['verndale/migrator', 'verndale/ai-orchestration']);
const FIELDS = Object.freeze(['publisher', 'package', 'version', 'revision', 'release_url']);

function forwardedPayload(event) {
  const client_payload = {};
  for (const key of FIELDS) {
    const value = event.client_payload?.[key];
    if (typeof value === 'string' && value.length <= 2048) client_payload[key] = value;
  }
  return { event_type: 'package-released', ...(Object.keys(client_payload).length ? { client_payload } : {}) };
}

if (require.main === module) {
  const destination = process.env.DISPATCH_DESTINATION;
  if (!DESTINATIONS.includes(destination)) throw new Error('Unknown notification destination.');
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  try {
    execFileSync('gh', ['api', '--method', 'POST', `repos/${destination}/dispatches`, '--input', '-'], {
      input: JSON.stringify(forwardedPayload(event)), stdio: ['pipe', 'ignore', 'ignore'],
    });
    console.log('Notification submission accepted.');
  } catch {
    console.error('::error::Notification submission failed; private scheduled scans provide fallback.');
    process.exitCode = 1;
  }
}

module.exports = { DESTINATIONS, FIELDS, forwardedPayload };
