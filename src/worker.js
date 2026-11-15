/**
 * Taal website, plus the licence service that client studios check in with.
 *
 * GET /api/licence  with header  Authorization: Licence <key>
 *   -> 200 {"status":"active"} or {"status":"ended","ended_at":"2027-03-01","grace_days":30}
 *   -> 404 for an unknown key
 *
 * Licences live in the LICENCES KV namespace (taal-licences), one entry per studio:
 *   key:   the studio's licence key (a long random string, e.g. `openssl rand -hex 24`)
 *   value: {"studio":"SQ Fitness","status":"active"}
 * When a plan ends, change the value to {"studio":"SQ Fitness","status":"ended","ended_at":"YYYY-MM-DD"}.
 * Everything else is the static site in ./public.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/licence') return licence(request, env);
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    return env.ASSETS.fetch(request);
  },
};

async function licence(request, env) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const auth = request.headers.get('authorization') || '';
  const key = auth.startsWith('Licence ') ? auth.slice(8).trim() : '';
  if (key.length < 16) return json({ error: 'Missing licence key' }, 401);
  const raw = await env.LICENCES.get(key);
  if (!raw) return json({ error: 'Unknown licence' }, 404);
  let rec;
  try { rec = JSON.parse(raw); } catch { rec = { status: 'active' }; }
  const status = rec.status === 'ended' ? 'ended' : 'active';
  return json(status === 'ended'
    ? { status, ended_at: rec.ended_at || null, grace_days: Number.isFinite(rec.grace_days) ? rec.grace_days : 30 }
    : { status });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
