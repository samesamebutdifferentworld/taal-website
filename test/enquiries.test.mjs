// Run with: node --test test/*.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { stripeSignatureOk } from '../src/enquiries.js';

function kv() {
  const m = new Map();
  return {
    m,
    async get(k, o) { const v = m.get(k); if (!v) return null; return o && o.type === 'arrayBuffer' ? v.value : v.value; },
    async getWithMetadata(k) { const v = m.get(k); return v ? { value: v.value, metadata: v.metadata } : { value: null, metadata: null }; },
    async put(k, value, o = {}) { m.set(k, { value, metadata: o.metadata }); },
    async list({ prefix }) { return { keys: [...m].filter(([k]) => k.startsWith(prefix)).map(([name, v]) => ({ name, metadata: v.metadata })), list_complete: true }; },
  };
}

let env, sent, stripeCalls, paid;
beforeEach(() => {
  sent = []; stripeCalls = []; paid = true;
  env = {
    ENQUIRIES: kv(), LICENCES: kv(), ASSETS: { fetch: () => new Response('asset') },
    RESEND_API_KEY: 're_test', EMAIL_FROM: 'Tim at Taal <hello@taal.test>', CONTACT_EMAIL: 'tim@taal.test',
    CALL_URL: 'https://cal.test/tim', STRIPE_SECRET_KEY: 'sk_test', STRIPE_WEBHOOK_SECRET: 'whsec_test', ADMIN_KEY: 'a'.repeat(24),
  };
  globalThis.fetch = async (url, init = {}) => {
    if (url.startsWith('https://api.resend.com')) { sent.push(JSON.parse(init.body)); return Response.json({ id: 'em_1' }); }
    if (url.startsWith('https://api.stripe.com')) {
      stripeCalls.push({ url, method: init.method, body: init.body ? Object.fromEntries(new URLSearchParams(init.body)) : null });
      if (init.method === 'POST') return Response.json({ id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1' });
      const id = stripeCalls.find((c) => c.method === 'POST')?.body.client_reference_id;
      return Response.json({ id: 'cs_test_1', client_reference_id: id, payment_status: paid ? 'paid' : 'unpaid', payment_intent: 'pi_1' });
    }
    throw new Error('unexpected fetch ' + url);
  };
});

const call = (path, init = {}) => worker.fetch(new Request('https://taal.test' + path, init), env);
const post = (path, body) => call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const enquiry = { name: 'Sam Jones', studio: 'Flow Yoga', email: 'Sam@Flow.test', members: '100 to 300', note: 'On Mindbody', colour: '#5E2C4E' };

test('an enquiry is saved and both emails go out', async () => {
  const r = await (await post('/api/enquiry', enquiry)).json();
  assert.match(r.id, /^[0-9a-f]{32}$/);
  assert.equal(r.brief_url, `https://taal.test/brief.html?e=${r.id}`);
  assert.equal(r.call_url, 'https://cal.test/tim');
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0].to, ['sam@flow.test']);
  assert.match(sent[0].html, /Book a call/);
  assert.ok(sent[0].html.includes(r.brief_url));
  assert.ok(sent[0].text.includes('£5'));
  assert.equal(sent[0].reply_to, 'tim@taal.test');
  assert.deepEqual(sent[1].to, ['tim@taal.test']);
  assert.match(sent[1].subject, /Flow Yoga/);
});

test('missing fields and bad emails are refused', async () => {
  let res = await post('/api/enquiry', { ...enquiry, email: 'nope' });
  assert.equal(res.status, 400);
  res = await post('/api/enquiry', { ...enquiry, studio: '' });
  assert.equal((await res.json()).error, 'Add your studio name.');
  assert.equal(sent.length, 0);
});

test('the hidden field stops bots without saving anything', async () => {
  const res = await post('/api/enquiry', { ...enquiry, website: 'spam.test' });
  assert.equal(res.status, 200);
  assert.equal([...env.ENQUIRIES.m.keys()].filter((k) => k.startsWith('enq:')).length, 0);
});

test('six enquiries in an hour from one address are limited', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await post('/api/enquiry', enquiry)).status, 200);
  assert.equal((await post('/api/enquiry', enquiry)).status, 429);
});

test('without an email key, enquiries still save and nothing is sent', async () => {
  delete env.RESEND_API_KEY;
  const res = await post('/api/enquiry', enquiry);
  assert.equal(res.status, 200);
  assert.equal(sent.length, 0);
});

async function brief(id, extra = {}) {
  const fd = new FormData();
  fd.set('e', id); fd.set('studio', 'Flow Yoga'); fd.set('services', 'Vinyasa 60 min'); fd.set('colour', '#5E2C4E');
  fd.set('logo', new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' }));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return call('/api/brief', { method: 'POST', body: fd });
}

test('a brief goes to Stripe for £5, and payment is confirmed once', async () => {
  const { id } = await (await post('/api/enquiry', enquiry)).json();
  sent = [];
  const r = await (await brief(id)).json();
  assert.equal(r.status, 'pay');
  assert.equal(r.checkout_url, 'https://checkout.stripe.test/cs_test_1');
  const s = stripeCalls[0].body;
  assert.equal(s['line_items[0][price_data][unit_amount]'], '500');
  assert.equal(s['line_items[0][price_data][currency]'], 'gbp');
  assert.equal(s.client_reference_id, id);
  assert.equal(s.customer_email, 'sam@flow.test');
  assert.ok(env.ENQUIRIES.m.has(`logo:${id}`));

  const info = await (await call(`/api/enquiry/${id}`)).json();
  assert.equal(info.brief, 'unpaid');
  assert.equal(info.fields.services, 'Vinyasa 60 min');
  assert.equal(info.has_logo, true);

  const c = await (await post('/api/brief/confirm', { e: id, session: 'cs_test_1' })).json();
  assert.equal(c.status, 'paid');
  assert.match(c.demo_due, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(sent.length, 2);
  assert.match(sent[0].subject, /on its way/);
  assert.match(sent[1].subject, /Demo brief paid: Flow Yoga/);

  // Again (a refresh, or the webhook): no second round of emails.
  await post('/api/brief/confirm', { e: id, session: 'cs_test_1' });
  assert.equal(sent.length, 2);
});

test('an unpaid session is not marked paid', async () => {
  paid = false;
  const { id } = await (await post('/api/enquiry', enquiry)).json();
  await brief(id);
  const c = await (await post('/api/brief/confirm', { e: id, session: 'cs_test_1' })).json();
  assert.equal(c.status, 'unpaid');
});

test('a brief without the classes is refused, and big logos are refused', async () => {
  const { id } = await (await post('/api/enquiry', enquiry)).json();
  assert.equal((await brief(id, { services: '' })).status, 400);
  const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
  assert.equal((await brief(id, { logo: big })).status, 400);
});

test('without Stripe the brief is saved for a payment link by email', async () => {
  delete env.STRIPE_SECRET_KEY;
  const { id } = await (await post('/api/enquiry', enquiry)).json();
  const r = await (await brief(id)).json();
  assert.equal(r.status, 'saved');
});

test('the Stripe webhook marks a brief paid when the signature is right', async () => {
  const { id } = await (await post('/api/enquiry', enquiry)).json();
  await brief(id);
  sent = [];
  const raw = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', client_reference_id: id, payment_status: 'paid' } } });
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('whsec_test'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`))).toString('hex');
  const bad = await call('/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${'0'.repeat(64)}` }, body: raw });
  assert.equal(bad.status, 400);
  const ok = await call('/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${sig}` }, body: raw });
  assert.equal(ok.status, 200);
  assert.equal((await (await call(`/api/enquiry/${id}`)).json()).brief, 'paid');
  assert.equal(sent.length, 2);
  assert.equal(await stripeSignatureOk(raw, `t=${t - 1000},v1=${sig}`, 'whsec_test'), false);
});

test('admin needs the key, then lists enquiries and serves the logo', async () => {
  const { id } = await (await post('/api/enquiry', enquiry)).json();
  await brief(id);
  assert.equal((await call('/api/admin/enquiries')).status, 401);
  const auth = { headers: { authorization: 'Bearer ' + 'a'.repeat(24) } };
  const list = await (await call('/api/admin/enquiries', auth)).json();
  assert.equal(list.enquiries[0].studio, 'Flow Yoga');
  assert.equal(list.enquiries[0].brief, 'unpaid');
  const logo = await call(`/api/admin/enquiries/${id}/logo`, auth);
  assert.equal(logo.headers.get('content-type'), 'image/png');
});

test('unknown ids and other paths still 404', async () => {
  assert.equal((await call('/api/enquiry/' + '0'.repeat(32))).status, 404);
  assert.equal((await call('/api/nothing')).status, 404);
  assert.equal(await (await call('/')).text(), 'asset');
});
