/**
 * taal website, plus the licence service that client studios check in with.
 *
 * GET /api/licence  with header  Authorization: Licence <key>
 *   -> 200 {"status":"active"} or {"status":"ended","ended_at":"2027-03-01","grace_days":30}
 *   -> 404 for an unknown key
 *
 * Licences live in the LICENCES KV namespace (taal-licences), one entry per studio:
 *   key:   the studio's licence key (a long random string, e.g. `openssl rand -hex 24`)
 *   value: {"studio":"SQ Fitness","status":"active"}
 * Licences are permanent. Only if a setup payment is over 30 days overdue, change the value to
 * {"studio":"SQ Fitness","status":"ended","ended_at":"YYYY-MM-DD"}; set it back to active once paid.
 * The demo builder (studios build their own demo): see src/demos.js.
 * Everything else is the static site in ./public, served on taal.solutions (www and workers.dev redirect).
 * Partner links: /r/<code> sends people to /?ref=<code>; the code then rides along every link on the site,
 * and is saved with the demos they build and the calls they book (see src/demos.js).
 */
import { demos, followUps, cleanRef } from './demos.js';
import { clients, clientJobs, agreementPage } from './clients.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // www.taal.solutions and the old workers.dev address send people to taal.solutions.
    const home = env.PUBLIC_URL ? new URL(env.PUBLIC_URL) : null;
    if (home && url.hostname !== home.hostname && (url.hostname === 'www.' + home.hostname || url.hostname.endsWith('.workers.dev')) && !url.pathname.startsWith('/api/')) {
      return Response.redirect(home.origin + url.pathname + url.search, 301);
    }
    // One address per page, for search engines: old pages and .html addresses move for good.
    if (/^\/(yoga|pilates)(\.html)?\/?$/.test(url.pathname)) return Response.redirect(url.origin + '/yoga-pilates' + url.search, 301);
    const guide = url.pathname.match(/^\/guides\/([a-z-]+)\.html$/);
    if (guide) return Response.redirect(url.origin + (guide[1] === 'index' ? '/guides/' : '/guides/' + guide[1]) + url.search, 301);
    const page = url.pathname.match(/^\/([a-z-]+)\.html$/);
    if (page && page[1] !== 'admin') return Response.redirect(url.origin + (page[1] === 'index' ? '/' : '/' + page[1]) + url.search, 301);
    // Partner links: taal.solutions/r/sam -> the home page, with the partner's code in the address.
    const short = url.pathname.match(/^\/r\/([^/]+)\/?$/);
    if (short) {
      const ref = cleanRef(decodeURIComponent(short[1]));
      return Response.redirect(url.origin + '/' + (ref ? '?ref=' + ref : ''), 302);
    }
    if (url.pathname === '/api/licence') return licence(request, env);
    // A studio's private portal and its agreement: taal.solutions/client/<token>, /agreement/<token>.
    const portal = url.pathname.match(/^\/(client|agreement)\/([a-f0-9]{32})\/?$/);
    if (portal) {
      if (portal[1] === 'agreement') return agreementPage(env, portal[2]);
      const page = await env.ASSETS.fetch(new Request(new URL('/client', url), request));
      const res = new Response(page.body, page);
      res.headers.set('x-robots-tag', 'noindex');
      res.headers.set('referrer-policy', 'no-referrer');
      return res;
    }
    if (url.pathname.startsWith('/api/')) {
      const res = (await clients(request, env, url)) || (await demos(request, env, url));
      if (res) return res;
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    const res = await env.ASSETS.fetch(request);
    // A partner's code stays in the address as people move between pages, without cookies or storage:
    // every link to another page of the site carries it on.
    const ref = cleanRef(url.searchParams.get('ref'));
    if (!ref || !(res.headers.get('content-type') || '').includes('text/html') || typeof HTMLRewriter === 'undefined') return res;
    return new HTMLRewriter().on('a[href]', {
      element(a) {
        const href = a.getAttribute('href');
        if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) return;
        let to; try { to = new URL(href, url); } catch { return; }
        if (to.origin !== url.origin || to.pathname.startsWith('/api/') || to.searchParams.has('ref')) return;
        to.searchParams.set('ref', ref);
        a.setAttribute('href', to.pathname + to.search + to.hash);
      },
    }).transform(res);
  },

  // Every hour: call summaries and follow-ups (src/clients.js). At 08:17 UTC, the nudge to studios who
  // built a demo three days ago; at 09:17, reminders about details and reviews.
  async scheduled(event, env, ctx) {
    const hour = new Date(event.scheduledTime || Date.now()).getUTCHours();
    if (hour === 8) ctx.waitUntil(followUps(env));
    ctx.waitUntil(clientJobs(env, event.scheduledTime || Date.now()));
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
