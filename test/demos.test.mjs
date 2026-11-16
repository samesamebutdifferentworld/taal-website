// Run with: node --test test/*.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

function kv() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.get(k)?.value ?? null; },
    async put(k, value, o = {}) { m.set(k, { value, metadata: o.metadata }); },
    async list({ prefix }) { return { keys: [...m].filter(([k]) => k.startsWith(prefix)).map(([name, v]) => ({ name, metadata: v.metadata })), list_complete: true }; },
  };
}

let env, sent, built, reply;
beforeEach(() => {
  sent = []; built = [];
  reply = (req) => ({ ok: true, slug: 'flow-yoga-k3x9p', name: req.name, expires_at: '2026-12-15T21:00:00.000Z' });
  env = {
    ENQUIRIES: kv(), LICENCES: kv(), ASSETS: { fetch: () => new Response('asset') },
    BOOKING: { async create(req) { built.push(req); return reply(req); } },
    BOOKING_URL: 'https://booking.test',
    RESEND_API_KEY: 're_test', EMAIL_FROM: 'Tim at Taal <hello@taal.test>', CONTACT_EMAIL: 'tim@taal.test',
    CALL_URL: 'https://cal.test/tim', ADMIN_KEY: 'a'.repeat(24),
  };
  globalThis.fetch = async (url, init = {}) => {
    if (url.startsWith('https://api.resend.com')) { sent.push(JSON.parse(init.body)); return Response.json({ id: 'em_1' }); }
    throw new Error('unexpected fetch ' + url);
  };
});

const call = (path, init = {}) => worker.fetch(new Request('https://taal.test' + path, init), env);
function form(extra = {}) {
  const fd = new FormData();
  const base = { name: 'Sam Jones', email: 'Sam@Flow.test', studio: 'Flow Yoga', kind: 'yoga', colour: '#5E2C4E', accent: '#D8BF8C', font: 'elegant', classes: 'Vinyasa\n\nYin\n' };
  for (const [k, v] of Object.entries({ ...base, ...extra })) fd.set(k, v);
  return fd;
}
const build = (extra) => call('/api/build', { method: 'POST', body: form(extra) });

test('a demo is built, the studio gets its links and you are told', async () => {
  const res = await build({ logo: new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' }) });
  const r = await res.json();
  assert.equal(res.status, 200);
  assert.equal(r.member_url, 'https://booking.test/?s=flow-yoga-k3x9p');
  assert.equal(r.admin_url, 'https://booking.test/admin/?s=flow-yoga-k3x9p');
  assert.equal(r.call_url, 'https://cal.test/tim');
  const req = built[0];
  assert.equal(req.name, 'Flow Yoga');
  assert.equal(req.kind, 'yoga');
  assert.equal(req.brand_color, '#5E2C4E');
  assert.equal(req.font, 'elegant');
  assert.deepEqual(req.classes, ['Vinyasa', 'Yin']);
  assert.equal(req.cta_url, 'https://cal.test/tim');
  assert.equal(req.days, 30);
  assert.equal(req.books, 'both');
  assert.equal(req.gift_cards, true);
  assert.equal(req.offpeak, null);
  assert.equal(req.logo.type, 'image/png');
  assert.equal(req.logo.data.byteLength, 4);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0].to, ['sam@flow.test']);
  assert.match(sent[0].subject, /Flow Yoga demo is ready/);
  assert.ok(sent[0].html.includes(r.member_url) && sent[0].html.includes(r.admin_url) && sent[0].html.includes('Book a call'));
  assert.deepEqual(sent[1].to, ['tim@taal.test']);
  assert.match(sent[1].text, /Type: Yoga/);
});

test('without a call link, the demo points back to the call section of the page', async () => {
  env.CALL_URL = '';
  await build();
  assert.equal(built[0].cta_url, 'https://taal.test/demo.html#call');
  assert.match(sent[0].text, /reply to this email/);
});

test('missing details and bad files are refused before anything is built', async () => {
  assert.equal((await build({ email: 'nope' })).status, 400);
  assert.equal((await build({ logo: new File(['x'], 'a.gif', { type: 'image/gif' }) })).status, 400);
  assert.equal((await build({ website: 'spam.test' })).status, 400);
  assert.equal(built.length, 0);
});

test('only the email is required', async () => {
  const res = await build({ studio: '', name: '' });
  assert.equal(res.status, 200);
  assert.equal(built.at(-1).name, 'Your studio');
  assert.ok(sent.some((m) => /Hi there/.test(JSON.stringify(m))));
  built.length = 0; sent.length = 0;
});

test('odd values fall back to safe ones', async () => {
  await build({ kind: 'boxing', colour: 'red', font: 'comic' });
  assert.equal(built[0].kind, 'fitness');
  assert.equal(built[0].brand_color, '#135855');
  assert.equal(built[0].font, 'modern');
});

test('an error from the booking app is shown to the studio', async () => {
  reply = () => ({ ok: false, error: 'Add your studio name' });
  const res = await build();
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'Add your studio name');
  assert.equal(sent.length, 0);
});

test('three demos a day per email address', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await build()).status, 200);
  assert.equal((await build()).status, 429);
});

test('without the booking connection it says so', async () => {
  delete env.BOOKING;
  assert.equal((await build()).status, 503);
});

test('admin lists who built a demo, behind the key', async () => {
  await build();
  assert.equal((await call('/api/admin/leads')).status, 401);
  const r = await (await call('/api/admin/leads', { headers: { authorization: 'Bearer ' + 'a'.repeat(24) } })).json();
  assert.equal(r.leads[0].studio, 'Flow Yoga');
  assert.equal(r.leads[0].kind, 'yoga');
  assert.equal(r.leads[0].member_url, 'https://booking.test/?s=flow-yoga-k3x9p');
});

test('the old enquiry and brief addresses are gone, and the licence check still works', async () => {
  assert.equal((await call('/api/enquiry', { method: 'POST' })).status, 404);
  assert.equal((await call('/api/brief', { method: 'POST' })).status, 404);
  assert.equal((await call('/api/licence')).status, 401);
  assert.equal(await (await call('/demo.html')).text(), 'asset');
});

test('what they offer goes through to the demo', async () => {
  await build({ books: 'classes', gift_cards: 'off', offpeak: 'on', op_open: '09:30', op_close: '15:00', op_weekends: 'on', op_price: '55' });
  const req = built[0];
  assert.equal(req.books, 'classes');
  assert.equal(req.gift_cards, false);
  assert.deepEqual(req.offpeak, { open: '09:30', close: '15:00', weekends: true, price: 5500 });
  await build({ books: 'nonsense', offpeak: 'on', op_open: 'later', op_price: 'x' });
  assert.equal(built[1].books, 'both');
  assert.deepEqual(built[1].offpeak, { open: '10:00', close: '16:00', weekends: false, price: 4500 });
});

const ask = (body) => call('/api/call', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('arrange a call: saves the lead, emails the studio a booking link and tells Tim', async () => {
  const res = await ask({ name: 'Sam Jones', email: 'Sam@Flow.test', studio: 'Flow Yoga', phone: '07700 900123', package: 'Booking system and apps, over 12 months', note: 'Moving from Mindbody' });
  assert.equal(res.status, 200);
  const r = await res.json();
  assert.equal(r.ok, true); assert.equal(r.emailed, true); assert.equal(r.call_url, 'https://cal.test/tim');
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0].to, ['sam@flow.test']);
  assert.match(sent[0].html, /Book a time/); assert.match(sent[0].text, /cal\.test\/tim\?name=Sam\+Jones&email=sam%40flow\.test/);
  assert.deepEqual(sent[1].to, ['tim@taal.test']);
  assert.match(sent[1].text, /Looking at: Booking system and apps, over 12 months/);
  const res2 = await call('/api/admin/leads', { headers: { authorization: 'Bearer ' + 'a'.repeat(24) } });
  const { leads } = await res2.json();
  assert.equal(leads.length, 1); assert.equal(leads[0].type, 'call'); assert.equal(leads[0].phone, '07700 900123');
});

test('arrange a call without a booking link asks them to reply with times', async () => {
  env.CALL_URL = '';
  const r = await (await ask({ name: 'Sam', email: 'sam@flow.test', studio: 'Flow' })).json();
  assert.equal(r.call_url, '');
  assert.match(sent[0].text, /Reply to this email with a few times/);
});

test('arrange a call needs a name, studio and a real email, and ignores bots', async () => {
  assert.equal((await ask({ email: 'sam@flow.test', studio: 'Flow' })).status, 400);
  assert.equal((await ask({ name: 'Sam', email: 'sam@flow.test' })).status, 400);
  assert.equal((await ask({ name: 'Sam', email: 'nope', studio: 'Flow' })).status, 400);
  const bot = await (await ask({ name: 'Sam', email: 'sam@flow.test', studio: 'Flow', website: 'x' })).json();
  assert.equal(bot.ok, true); assert.equal(sent.length, 0);
});

test('call requests have their own daily limit, separate from demos', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await build()).status, 200);
  assert.equal((await ask({ name: 'Sam', email: 'sam@flow.test', studio: 'Flow' })).status, 200);
});
