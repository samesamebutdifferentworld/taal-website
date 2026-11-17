// Run with: node --test test/*.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../src/worker.js';
import { clientJobs, stripeSigned, missing } from '../src/clients.js';
import { quote } from '../src/prices.js';

function kv() {
  const m = new Map();
  return {
    m,
    async get(k, o) { const v = m.get(k); if (!v) return null; return o?.type === 'arrayBuffer' ? v.value : v.value; },
    async getWithMetadata(k) { const v = m.get(k); return v ? { value: v.value, metadata: v.metadata } : { value: null, metadata: null }; },
    async delete(k) { m.delete(k); },
    async put(k, value, o = {}) { m.set(k, { value, metadata: o.metadata }); },
    async list({ prefix }) { return { keys: [...m].filter(([k]) => k.startsWith(prefix)).map(([name, v]) => ({ name, metadata: v.metadata })), list_complete: true }; },
  };
}

let env, sent, stripeCalls, briefs;
beforeEach(() => {
  sent = []; stripeCalls = []; briefs = [];
  env = {
    ENQUIRIES: kv(), LICENCES: kv(), CLIENTS: kv(), ASSETS: { fetch: (r) => new Response('portal page ' + new URL(r.url).pathname, { headers: { 'content-type': 'text/html' } }) },
    BOOKING: { async create() { return { ok: true }; }, async createFromBrief(b) { briefs.push(b); return { ok: true, slug: 'flow-yoga-abcde', name: b.name, expires_at: '2027-02-01T00:00:00Z' }; } },
    BOOKING_URL: 'https://app.taal.test', PUBLIC_URL: 'https://taal.test',
    RESEND_API_KEY: 're_test', EMAIL_FROM: 'Tim at taal <hello@taal.test>', CONTACT_EMAIL: 'tim@taal.test',
    CALL_URL: 'https://cal.test/tim', ADMIN_KEY: 'a'.repeat(24),
  };
  globalThis.fetch = async (url, init = {}) => {
    if (url.startsWith('https://api.resend.com')) { sent.push(JSON.parse(init.body)); return Response.json({ id: 'em_1' }); }
    if (url.startsWith('https://api.stripe.com')) {
      const path = url.slice('https://api.stripe.com/v1/'.length);
      const body = Object.fromEntries(new URLSearchParams(init.body || ''));
      stripeCalls.push({ path, body });
      if (path === 'customers') return Response.json({ id: 'cus_1' });
      if (path === 'invoices') return Response.json({ id: 'in_1' });
      if (path.endsWith('/finalize')) return Response.json({ id: 'in_1', hosted_invoice_url: 'https://pay.stripe.test/in_1', number: 'TAAL-0001' });
      if (path === 'checkout/sessions') return Response.json({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' });
      return Response.json({ id: 'x' });
    }
    throw new Error('unexpected fetch ' + url);
  };
});

const call = (path, init = {}) => worker.fetch(new Request('https://taal.test' + path, init), env);
const adminPost = (path, body) => call('/api/admin/' + path, { method: 'POST', headers: { authorization: 'Bearer ' + env.ADMIN_KEY, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const jpost = (path, body, method = 'POST') => call(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function offered(order = {}) {
  const res = await adminPost('clients', { studio: 'Flow Yoga', name: 'Sam Jones', email: 'Sam@Flow.test', kind: 'yoga', ...order });
  assert.equal(res.status, 200);
  return (await res.json()).client;
}
const signBody = { legal_name: 'Flow Yoga Ltd', address: '1 High St, London SW12', name: 'Sam Jones', title: 'Owner', signature: 'sam jones', accept: true, care: true };

test('prices match the website', () => {
  assert.equal(quote({ apps: true, site: true, plan: '12' }).total, 4400);
  assert.equal(quote({ apps: true, site: true, plan: '24' }).total, 4800);
  const q = quote({ apps: true, site: true, plan: '24' });
  assert.deepEqual([q.start, q.monthly], [600, 175]);
  const once = quote({ apps: true });
  assert.deepEqual([once.total, once.first, once.last], [2900, 1450, 1450]);
  assert.equal(quote({ founding: true }).total, 1330);
});

test('admin needs the key', async () => {
  const res = await call('/api/admin/clients', { method: 'POST', body: '{}' });
  assert.equal(res.status, 401);
});

test('offering an agreement makes a portal and emails the link', async () => {
  const c = await offered({ apps: true, plan: '12' });
  assert.equal(c.stage, 'offered');
  assert.match(c.portal_url, /^https:\/\/taal\.test\/client\/[a-f0-9]{32}$/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to[0], 'sam@flow.test');
  assert.match(sent[0].html, /Read and sign/);
  assert.match(sent[0].html, /£600 when you sign, then £235 a month for 12 months/);
  // the portal page itself, and its data
  const token = c.portal_url.split('/').pop();
  const page = await call('/client/' + token);
  assert.match(await page.text(), /portal page \/client/);
  assert.equal(page.headers.get('x-robots-tag'), 'noindex');
  const view = await (await call('/api/client/' + token)).json();
  assert.equal(view.client.studio, 'Flow Yoga');
  assert.equal(view.client.notes, undefined, 'your notes stay private');
  const ag = await (await call(`/api/client/${token}/agreement`)).json();
  assert.match(ag.html, /Over 12 months|for 12 months/);
});

test('a bad token gets nothing', async () => {
  const res = await call('/api/client/' + 'f'.repeat(32));
  assert.equal(res.status, 404);
});

test('signing records who, when and what, and invoices the first half', async () => {
  const c = await offered({ apps: true });
  const token = c.portal_url.split('/').pop();
  sent = [];
  let res = await jpost(`/api/client/${token}/sign`, { ...signBody, signature: 'Someone Else' });
  assert.equal(res.status, 400);
  res = await jpost(`/api/client/${token}/sign`, { ...signBody, accept: false });
  assert.equal(res.status, 400);
  res = await call(`/api/client/${token}/sign`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '81.2.3.4' }, body: JSON.stringify(signBody) });
  assert.equal(res.status, 200);
  const v = (await res.json()).client;
  assert.equal(v.stage, 'signed');
  assert.equal(v.invoices[0].amount, 1450);
  assert.equal(v.invoices[0].status, 'manual', 'without Stripe it waits for you');
  const rec = JSON.parse(env.CLIENTS.m.get(`client:${c.id}`).value);
  assert.equal(rec.signed.ip, '81.2.3.4');
  assert.match(rec.signed.sha256, /^[a-f0-9]{64}$/);
  assert.match(env.CLIENTS.m.get(`signed:${c.id}`).value, /Flow Yoga Ltd of 1 High St/);
  assert.ok(sent.some((e) => e.to[0] === 'sam@flow.test' && /Welcome to taal/.test(e.subject)));
  assert.ok(sent.some((e) => e.to[0] === 'tim@taal.test' && /Signed: Flow Yoga/.test(e.subject)));
  // signing twice doesn't
  assert.equal((await jpost(`/api/client/${token}/sign`, signBody)).status, 400);
  // the printable copy, then countersigned
  let page = await (await call('/agreement/' + token)).text();
  assert.match(page, /Signed for taal: waiting/);
  assert.match(page, /Signing record/);
  const cs = await adminPost('clients/' + c.id, { do: 'countersign' });
  assert.equal(cs.status, 200);
  page = await (await call('/agreement/' + token)).text();
  assert.doesNotMatch(page, /Signed for taal: waiting/);
  assert.match(page, /signed for taal on/);
});

test('with Stripe, signing sends a real invoice', async () => {
  env.STRIPE_SECRET_KEY = 'sk_test_1';
  const c = await offered({ plan: '24', site: true });
  const token = c.portal_url.split('/').pop();
  const v = (await (await jpost(`/api/client/${token}/sign`, signBody)).json()).client;
  assert.deepEqual(stripeCalls.map((s) => s.path), ['customers', 'invoiceitems', 'invoices', 'invoices/in_1/finalize', 'invoices/in_1/send']);
  assert.equal(stripeCalls[1].body.amount, '50000');
  assert.equal(stripeCalls[2].body['metadata[ref]'], 'first');
  assert.equal(v.invoices[0].url, 'https://pay.stripe.test/in_1');
  assert.equal(v.invoices[0].status, 'open');
});

test('details save as they go, files upload, and what is missing is listed', async () => {
  const c = await offered();
  const token = c.portal_url.split('/').pop();
  assert.equal((await jpost(`/api/client/${token}/brief`, { part: 'classes', data: [] }, 'PUT')).status, 400, 'not before signing');
  await jpost(`/api/client/${token}/sign`, signBody);
  let res = await jpost(`/api/client/${token}/brief`, { part: 'classes', data: [{ name: 'Vinyasa', minutes: 60 }] }, 'PUT');
  assert.equal(res.status, 200);
  assert.equal((await jpost(`/api/client/${token}/brief`, { part: 'nonsense', data: {} }, 'PUT')).status, 400);
  await jpost(`/api/client/${token}/brief`, { part: 'studio', data: { about: 'Calm.', address: 'Balham' } }, 'PUT');
  const fd = new FormData();
  fd.append('section', 'logo');
  fd.append('file', new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' }));
  res = await call(`/api/client/${token}/files`, { method: 'POST', body: fd });
  assert.equal(res.status, 200);
  const { file } = await res.json();
  const bad = new FormData(); bad.append('section', 'photos'); bad.append('file', new File(['x'], 'notes.exe', { type: 'application/octet-stream' }));
  assert.equal((await call(`/api/client/${token}/files`, { method: 'POST', body: bad })).status, 400);
  const img = await call(`/api/client/${token}/files/${file.id}`);
  assert.equal(img.headers.get('content-type'), 'image/png');
  const rec = JSON.parse(env.CLIENTS.m.get(`client:${c.id}`).value);
  assert.equal(rec.stage, 'building');
  const gaps = missing(rec);
  assert.ok(gaps.includes('Your timetable'));
  assert.ok(!gaps.includes('Your logo'));
  sent = [];
  res = await call(`/api/client/${token}/submit`, { method: 'POST' });
  assert.ok((await res.json()).missing.includes('Your team'));
  assert.ok(sent.some((e) => /sent their details/.test(e.subject)));
});

test('demo, review, changes, approval and go-live', async () => {
  const c = await offered({ plan: 'once' });
  const token = c.portal_url.split('/').pop();
  await jpost(`/api/client/${token}/sign`, signBody);
  await jpost(`/api/client/${token}/brief`, { part: 'brand', data: { colour: '#5E2C4E', accent: '#D8BF8C', font: 'elegant' } }, 'PUT');
  await jpost(`/api/client/${token}/brief`, { part: 'timetable', data: [{ day: 'Monday', time: '07:00', class: 'Vinyasa', teacher: 'Ana' }] }, 'PUT');
  assert.equal((await jpost(`/api/client/${token}/approve`, {})).status, 400, 'nothing to approve yet');
  let r = await (await adminPost('clients/' + c.id, { do: 'demo' })).json();
  assert.equal(r.client.demo.slug, 'flow-yoga-abcde');
  assert.equal(briefs[0].brand_color, '#5E2C4E');
  assert.equal(briefs[0].timetable[0].class, 'Vinyasa');
  sent = [];
  r = await (await adminPost('clients/' + c.id, { do: 'review' })).json();
  assert.equal(r.client.stage, 'review');
  assert.match(sent[0].subject, /ready to review/);
  const view = (await (await call('/api/client/' + token)).json()).client;
  assert.equal(view.demo.member_url, 'https://app.taal.test/?s=flow-yoga-abcde');
  await jpost(`/api/client/${token}/request`, { text: 'Make the logo bigger' });
  r = await (await adminPost('clients/' + c.id, { do: 'review' })).json();
  assert.equal(r.client.review_round, 2);
  assert.equal((await jpost(`/api/client/${token}/approve`, {})).status, 200);
  sent = [];
  r = await (await adminPost('clients/' + c.id, { do: 'live' })).json();
  assert.equal(r.client.stage, 'live');
  const last = r.client.invoices.find((i) => i.ref === 'last');
  assert.equal(last.amount, 950);
  assert.ok(sent.some((e) => /is live/.test(e.subject)));
});

test('monthly plans become a Direct Debit link at go-live, and stop after the agreed payments', async () => {
  env.STRIPE_SECRET_KEY = 'sk_test_1';
  env.STRIPE_WEBHOOK_SECRET = 'whsec_1';
  const c = await offered({ plan: '12', apps: true });
  const token = c.portal_url.split('/').pop();
  await jpost(`/api/client/${token}/sign`, { ...signBody, care: false });
  await adminPost('clients/' + c.id, { do: 'demo' });
  await adminPost('clients/' + c.id, { do: 'review' });
  await jpost(`/api/client/${token}/approve`, {});
  stripeCalls = [];
  const r = await (await adminPost('clients/' + c.id, { do: 'live' })).json();
  const plan = r.client.invoices.find((i) => i.ref === 'plan');
  assert.equal(plan.url, 'https://checkout.stripe.test/cs_1');
  const cs = stripeCalls.find((s) => s.path === 'checkout/sessions').body;
  assert.equal(cs['line_items[0][price_data][unit_amount]'], '23500');
  assert.equal(cs['payment_method_types[0]'], 'bacs_debit');
  // Stripe tells us it's set up: we set it to stop after 12 payments
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { subscription: 'sub_1', metadata: { client_id: c.id, ref: 'plan' } } } });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', 'whsec_1').update(`${t}.${payload}`).digest('hex');
  stripeCalls = [];
  let res = await call('/api/stripe', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${sig}` }, body: payload });
  assert.equal(res.status, 200);
  const cancel = stripeCalls.find((s) => s.path === 'subscriptions/sub_1');
  const months = (Number(cancel.body.cancel_at) * 1000 - Date.now()) / (30.44 * 86400000);
  assert.ok(months > 11.7 && months < 12, `cancel after 12 payments, got ${months}`);
  res = await call('/api/stripe', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${'0'.repeat(64)}` }, body: payload });
  assert.equal(res.status, 401);
});

test('stripe signatures: right secret, recent time', async () => {
  const body = '{"a":1}', t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', 's').update(`${t}.${body}`).digest('hex');
  assert.equal(await stripeSigned('s', body, `t=${t},v1=${v1}`), true);
  assert.equal(await stripeSigned('other', body, `t=${t},v1=${v1}`), false);
  assert.equal(await stripeSigned('s', body, `t=${t - 1000},v1=${v1}`), false);
});

test('call summaries go an hour after a booked call, then two follow-ups, and stop once offered', async () => {
  const at = Date.parse('2026-12-01T10:00:00Z');
  await env.ENQUIRIES.put('lead:cal-1', '{}', { metadata: { type: 'call', booked: true, name: 'Ana Lee', email: 'ana@studio.test', studio: 'Studio A', call_at: '2026-12-01T10:00:00Z', created_at: '2026-11-28T10:00:00Z', summary_note: 'You mentioned 400 members on Glofox.' } });
  assert.equal(await clientJobs(env, at + 30 * 60000), 0, 'not during the call');
  assert.equal(await clientJobs(env, at + 70 * 60000), 1);
  assert.match(sent[0].subject, /Following up on our call/);
  assert.match(sent[0].html, /400 members on Glofox/);
  assert.match(sent[0].html, /taal-overview\.pdf/);
  assert.equal(await clientJobs(env, at + 2 * 3600000), 0, 'only once');
  assert.equal(await clientJobs(env, at + 6 * 86400000), 1);
  assert.match(sent[1].subject, /Any questions/);
  // offered an agreement: no more follow-ups
  await adminPost('clients', { studio: 'Studio A', name: 'Ana Lee', email: 'ana@studio.test' });
  sent = [];
  assert.equal(await clientJobs(env, at + 13 * 86400000), 0);
});

test('leads can carry a note, be held or closed', async () => {
  await env.ENQUIRIES.put('lead:cal-2', '{}', { metadata: { type: 'call', booked: true, email: 'b@b.test', call_at: '2026-12-01T10:00:00Z', created_at: '2026-11-28T10:00:00Z' } });
  const r = await (await adminPost('leads/cal-2', { summary_hold: true, summary_note: 'hi' })).json();
  assert.equal(r.lead.summary_hold, true);
  assert.equal(await clientJobs(env, Date.parse('2026-12-01T12:00:00Z')), 0);
});

test('upload reminders three days after signing', async () => {
  const c = await offered();
  const token = c.portal_url.split('/').pop();
  await jpost(`/api/client/${token}/sign`, signBody);
  sent = [];
  const nine = new Date(); nine.setUTCDate(nine.getUTCDate() + 4); nine.setUTCHours(9, 17, 0, 0);
  assert.equal(await clientJobs(env, nine.getTime()), 1);
  assert.match(sent[0].subject, /what we need to build Flow Yoga/);
  assert.equal(await clientJobs(env, nine.getTime() + 3600000 * 24), 0, 'not again the next day');
});
