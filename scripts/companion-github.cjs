'use strict';

/** Single-target GitHub API. No retry of mutations; callers reconcile uncertainty. */
function github(repository, token, request = fetch) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !token)
    throw new Error('A validated repository and scoped token are required');
  const prefix = `https://api.github.com/repos/${repository}/`;
  async function call(method, route, body) {
    const url = new URL(route, prefix);
    if (!url.href.startsWith(prefix) || !/^(pulls|issues)(\/|\?|$)/.test(url.href.slice(prefix.length)))
      throw new Error('Companion API request escaped its target');
    const response = await request(url, {
      method, redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28', 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`GitHub ${method} failed (${response.status}); reconcile before retrying`);
    return { value: await response.json(), link: response.headers.get('link') || '' };
  }
  return {
    get: async route => (await call('GET', route)).value,
    write: async (method, route, body) => (await call(method, route, body)).value,
    async all(route) {
      const rows = [], visited = new Set();
      let next = route;
      while (next) {
        if (visited.has(next)) throw new Error('Repeated GitHub pagination link');
        visited.add(next);
        const page = await call('GET', next);
        if (!Array.isArray(page.value)) throw new Error('Expected a GitHub list');
        rows.push(...page.value);
        next = /<([^>]+)>; rel="next"/.exec(page.link)?.[1] || '';
      }
      return rows;
    },
  };
}
module.exports = { github };
