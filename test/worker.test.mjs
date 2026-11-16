import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const env = { PUBLIC_URL: 'https://taal.solutions', ASSETS: { fetch: () => new Response('page') } };
const get = (u) => worker.fetch(new Request(u), env);

test('www and the old workers.dev address redirect to taal.solutions, keeping the path', async () => {
  for (const from of ['https://www.taal.solutions/compare.html?x=1', 'https://taal-website.tjallan13.workers.dev/compare.html?x=1']) {
    const res = await get(from);
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), 'https://taal.solutions/compare.html?x=1');
  }
});

test('taal.solutions itself serves the site, and /api on old addresses still works', async () => {
  assert.equal(await (await get('https://taal.solutions/')).text(), 'page');
  assert.notEqual((await get('https://taal-website.tjallan13.workers.dev/api/nope')).status, 301);
});
