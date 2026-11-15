/**
 * Demo enquiries and briefs.
 *
 * 1. POST /api/enquiry          the form at the bottom of the site. Saved, then a thank-you email
 *                               offers two ways to start: book a call, or send a brief with £5.
 * 2. GET  /api/enquiry/:id      what the brief page needs (the id is a long random token).
 * 3. POST /api/brief            the brief (multipart, with an optional logo). Returns a Stripe
 *                               Checkout link for the £5.
 * 4. POST /api/brief/confirm    called on return from Stripe; checks the payment with Stripe.
 *    POST /api/stripe/webhook   the same, from Stripe, in case the person closes the tab.
 * 5. GET  /api/admin/...        list enquiries, read a brief, download a logo (Bearer ADMIN_KEY).
 *
 * Everything lives in the ENQUIRIES KV namespace and is deleted automatically after a year.
 * Email goes through Resend (RESEND_API_KEY, EMAIL_FROM); without a key nothing is sent and the
 * site still shows both options on screen.
 */

const YEAR = 365 * 86400;
const FEE_PENCE = 500;
const DEMO_DAYS = 7;
const MAX_LOGO = 2 * 1024 * 1024;
const MEMBERS = ['Under 100', '100 to 300', '300 to 1,000', 'Over 1,000'];

export async function enquiries(request, env, url) {
  const p = url.pathname;
  const m = request.method;
  try {
    if (p === '/api/enquiry' && m === 'POST') return await createEnquiry(request, env, url);
    if (p.startsWith('/api/enquiry/') && m === 'GET') return await readEnquiry(env, p.slice(13));
    if (p === '/api/brief' && m === 'POST') return await saveBrief(request, env, url);
    if (p === '/api/brief/confirm' && m === 'POST') return await confirmBrief(request, env, url);
    if (p === '/api/stripe/webhook' && m === 'POST') return await stripeWebhook(request, env, url);
    if (p.startsWith('/api/admin/')) return await admin(request, env, p.slice(11));
  } catch (err) {
    if (err instanceof Reply) return err.res;
    console.error(err);
    return json({ error: 'Something went wrong. Please try again, or email us.' }, 500);
  }
  return null;
}

/* ---------- 1. Enquiry ---------- */

async function createEnquiry(request, env, url) {
  const b = await body(request);
  // A hidden field people never see; bots fill it in.
  if (b.website) return json({ ok: true, id: 'x', brief_url: '/brief.html', call_url: env.CALL_URL || '' });
  const e = {
    name: text(b.name, 80, 'your name'),
    studio: text(b.studio, 80, 'your studio name'),
    email: email(b.email),
    members: MEMBERS.includes(b.members) ? b.members : '',
    note: String(b.note || '').trim().slice(0, 2000),
    colour: /^#[0-9a-f]{6}$/i.test(b.colour || '') ? b.colour : '',
  };
  await rateLimit(request, env);
  const id = token();
  const rec = { ...e, id, created_at: new Date().toISOString(), brief: 'none' };
  await putEnquiry(env, rec);

  const base = origin(env, url);
  const briefUrl = `${base}/brief.html?e=${id}`;
  const callUrl = env.CALL_URL || '';
  const first = e.name.split(' ')[0];
  await sendEmail(env, {
    to: e.email,
    subject: `Your Taal demo: two ways to start`,
    replyTo: env.CONTACT_EMAIL,
    ...thankYouEmail({ first, studio: e.studio, briefUrl, callUrl, contact: env.CONTACT_EMAIL }),
  });
  await notify(env, `New enquiry: ${e.studio}`, [
    ['Name', e.name], ['Studio', e.studio], ['Email', e.email], ['Active members', e.members],
    ['Colour', e.colour], ['Note', e.note],
  ]);
  return json({ ok: true, id, brief_url: briefUrl, call_url: callUrl });
}

async function readEnquiry(env, id) {
  const rec = await getEnquiry(env, id);
  const brief = rec.brief === 'none' ? null : await getJSON(env, `brief:${id}`);
  return json({
    name: rec.name.split(' ')[0],
    studio: rec.studio,
    colour: rec.colour,
    brief: rec.brief,
    demo_due: rec.demo_due || null,
    fields: brief ? brief.fields : null,
    has_logo: !!(brief && brief.logo),
    fee: FEE_PENCE,
    days: DEMO_DAYS,
    can_pay: !!env.STRIPE_SECRET_KEY,
  });
}

/* ---------- 3. Brief ---------- */

const BRIEF_FIELDS = {
  studio: [80, true],
  web: [200, false],
  colour: [7, false],
  colour2: [7, false],
  services: [3000, true],
  prices: [3000, false],
  timetable: [3000, false],
  other: [2000, false],
};

async function saveBrief(request, env, url) {
  const form = await request.formData().catch(() => fail(400, 'Please try sending the form again.'));
  const id = String(form.get('e') || '');
  const rec = await getEnquiry(env, id);
  if (rec.brief === 'paid') return json({ status: 'paid', demo_due: rec.demo_due });

  const fields = {};
  for (const [k, [max, required]] of Object.entries(BRIEF_FIELDS)) {
    const v = String(form.get(k) || '').trim().slice(0, max);
    if (required && !v) fail(400, k === 'studio' ? 'Add your studio name.' : 'List your classes and services so we can set them up.');
    fields[k] = v;
  }
  for (const k of ['colour', 'colour2']) if (fields[k] && !/^#[0-9a-f]{6}$/i.test(fields[k])) fields[k] = '';

  const prev = await getJSON(env, `brief:${id}`);
  let logo = prev ? prev.logo : null;
  const file = form.get('logo');
  if (file && typeof file === 'object' && file.size) {
    if (file.size > MAX_LOGO) fail(400, 'Your logo is over 2 MB. Try a smaller file, or send it by email later.');
    const type = file.type || '';
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(type)) fail(400, 'Logos can be PNG, JPG, SVG or WebP.');
    await env.ENQUIRIES.put(`logo:${id}`, await file.arrayBuffer(), { expirationTtl: YEAR, metadata: { type, name: String(file.name || 'logo').slice(0, 100) } });
    logo = { type, name: String(file.name || 'logo').slice(0, 100), size: file.size };
  }
  await env.ENQUIRIES.put(`brief:${id}`, JSON.stringify({ fields, logo, saved_at: new Date().toISOString() }), { expirationTtl: YEAR });
  if (rec.brief !== 'paid') rec.brief = 'unpaid';
  await putEnquiry(env, rec);

  if (!env.STRIPE_SECRET_KEY) {
    await notify(env, `Brief saved, not yet paid: ${fields.studio}`, [['Studio', fields.studio], ['Email', rec.email], ['Note', 'Online payment is not set up yet. Send them a payment link.']]);
    return json({ status: 'saved' });
  }
  const base = origin(env, url);
  const session = await stripe(env, 'POST', '/v1/checkout/sessions', {
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'gbp',
    'line_items[0][price_data][unit_amount]': String(FEE_PENCE),
    'line_items[0][price_data][product_data][name]': `Demo in your brand: ${fields.studio}`.slice(0, 120),
    'line_items[0][price_data][product_data][description]': `A working demo of your own booking app, within ${DEMO_DAYS} days.`,
    customer_email: rec.email,
    client_reference_id: id,
    'metadata[enquiry]': id,
    success_url: `${base}/brief.html?e=${id}&session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/brief.html?e=${id}&cancelled=1`,
  });
  return json({ status: 'pay', checkout_url: session.url });
}

/* ---------- 4. Payment ---------- */

async function confirmBrief(request, env, url) {
  const b = await body(request);
  const id = String(b.e || '');
  const rec = await getEnquiry(env, id);
  if (rec.brief === 'paid') return json({ status: 'paid', demo_due: rec.demo_due });
  if (!env.STRIPE_SECRET_KEY || !/^cs_[A-Za-z0-9_]+$/.test(String(b.session || ''))) fail(400, 'We could not check that payment.');
  const s = await stripe(env, 'GET', `/v1/checkout/sessions/${b.session}`);
  if (s.client_reference_id !== id || s.payment_status !== 'paid') return json({ status: 'unpaid' });
  const done = await markPaid(env, url, id, s);
  return json({ status: 'paid', demo_due: done.demo_due });
}

async function stripeWebhook(request, env, url) {
  const raw = await request.text();
  if (!env.STRIPE_WEBHOOK_SECRET || !(await stripeSignatureOk(raw, request.headers.get('stripe-signature') || '', env.STRIPE_WEBHOOK_SECRET))) {
    return json({ error: 'Bad signature' }, 400);
  }
  const event = JSON.parse(raw);
  const s = event.data && event.data.object;
  if (event.type === 'checkout.session.completed' && s && s.payment_status === 'paid' && s.client_reference_id) {
    const rec = await getJSON(env, `enq:${s.client_reference_id}`);
    if (rec && rec.brief !== 'paid') await markPaid(env, url, s.client_reference_id, s);
  }
  return json({ received: true });
}

export async function stripeSignatureOk(raw, header, secret, now = Date.now()) {
  const parts = Object.fromEntries(header.split(',').map((x) => x.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const t = Number(parts.t);
  const sigs = header.split(',').filter((x) => x.trim().startsWith('v1=')).map((x) => x.trim().slice(3));
  if (!t || !sigs.length || Math.abs(now / 1000 - t) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`)));
  return sigs.some((s) => s.length === mac.length && timingSafe(s, mac));
}

async function markPaid(env, url, id, session) {
  const rec = await getEnquiry(env, id);
  if (rec.brief === 'paid') return rec;
  const due = new Date(Date.now() + DEMO_DAYS * 86400_000);
  rec.brief = 'paid';
  rec.paid_at = new Date().toISOString();
  rec.demo_due = due.toISOString().slice(0, 10);
  rec.payment = session.payment_intent || session.id;
  await putEnquiry(env, rec);
  const brief = await getJSON(env, `brief:${id}`);
  const studio = (brief && brief.fields.studio) || rec.studio;
  const when = longDate(due);
  await sendEmail(env, {
    to: rec.email,
    subject: `Your demo is on its way`,
    replyTo: env.CONTACT_EMAIL,
    ...paidEmail({ first: rec.name.split(' ')[0], studio, when, contact: env.CONTACT_EMAIL }),
  });
  const f = (brief && brief.fields) || {};
  await notify(env, `Demo brief paid: ${studio}, due ${when}`, [
    ['Studio', studio], ['Name', rec.name], ['Email', rec.email], ['Members', rec.members],
    ['Website or Instagram', f.web], ['Colours', [f.colour, f.colour2].filter(Boolean).join(', ')],
    ['Logo', brief && brief.logo ? `${brief.logo.name} (in the admin page)` : 'none'],
    ['Classes and services', f.services], ['Memberships and prices', f.prices], ['Timetable', f.timetable], ['Anything else', f.other],
    ['Admin', `${origin(env, url)}/admin.html`],
  ]);
  return rec;
}

/* ---------- 5. Admin ---------- */

async function admin(request, env, rest) {
  const auth = request.headers.get('authorization') || '';
  if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 16 || !timingSafe(auth, `Bearer ${env.ADMIN_KEY}`)) return json({ error: 'Not signed in' }, 401);
  if (rest === 'enquiries') {
    const out = [];
    let cursor;
    do {
      const page = await env.ENQUIRIES.list({ prefix: 'enq:', cursor });
      for (const k of page.keys) out.push({ id: k.name.slice(4), ...(k.metadata || {}) });
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor && out.length < 5000);
    out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return json({ enquiries: out });
  }
  const m = rest.match(/^enquiries\/([0-9a-f]{32})(\/logo)?$/);
  if (m) {
    if (m[2]) {
      const { value, metadata } = await env.ENQUIRIES.getWithMetadata(`logo:${m[1]}`, { type: 'arrayBuffer' });
      if (!value) return json({ error: 'No logo' }, 404);
      return new Response(value, { headers: { 'content-type': metadata.type, 'content-disposition': `attachment; filename="${metadata.name.replace(/"/g, '')}"`, 'cache-control': 'no-store' } });
    }
    return json({ enquiry: await getJSON(env, `enq:${m[1]}`), brief: await getJSON(env, `brief:${m[1]}`) });
  }
  return json({ error: 'Not found' }, 404);
}

/* ---------- Emails ---------- */

const C = { paper: '#F2F3EE', ink: '#13201E', mute: '#55625F', green: '#0F5C57', rule: '#D3DAD3' };

function layout(inner) {
  return `<!doctype html><html><body style="margin:0;background:${C.paper};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${C.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:20px"><tr><td style="padding:36px 32px;font-size:16px;line-height:1.55">
<p style="margin:0 0 24px;font-weight:700;font-size:18px;color:${C.green}">taal</p>
${inner}
</td></tr></table>
<p style="margin:20px 0 0;font-size:12px;color:${C.mute}">Taal, studio software made in London.</p>
</td></tr></table></body></html>`;
}

const button = (href, label, solid = true) =>
  `<a href="${esc(href)}" style="display:inline-block;padding:13px 22px;border-radius:999px;text-decoration:none;font-weight:600;${solid ? `background:${C.green};color:#fff` : `color:${C.green};border:1.5px solid ${C.green}`}">${esc(label)}</a>`;

export function thankYouEmail({ first, studio, briefUrl, callUrl, contact }) {
  const call = callUrl
    ? `<p style="margin:0 0 6px"><b>Talk it through first</b></p><p style="margin:0 0 14px">Book a short Zoom call at a time that suits you and ask anything. No preparation needed.</p><p style="margin:0 0 28px">${button(callUrl, 'Book a call', false)}</p>`
    : `<p style="margin:0 0 6px"><b>Talk it through first</b></p><p style="margin:0 0 28px">Reply to this email with a few times that suit you and we'll set up a short Zoom call.</p>`;
  const html = layout(`<p style="margin:0 0 16px">Hi ${esc(first)},</p>
<p style="margin:0 0 24px">Thanks for telling us about ${esc(studio)}. There are two ways to start, whichever suits you.</p>
${call}
<p style="margin:0 0 6px"><b>Or see it straight away</b></p>
<p style="margin:0 0 14px">Fill in a short brief about your studio: your logo, colours, classes and prices. There's a £5 fee, just so we know you're serious, and you'll have a working demo in your brand within ${DEMO_DAYS} days.</p>
<p style="margin:0 0 28px">${button(briefUrl, 'Send your brief')}</p>
<p style="margin:0;color:${C.mute}">Any questions, just reply to this email.</p>
<p style="margin:16px 0 0">Tim<br><span style="color:${C.mute}">Founder, Taal</span></p>`);
  const textBody = `Hi ${first},

Thanks for telling us about ${studio}. There are two ways to start, whichever suits you.

Talk it through first
${callUrl ? `Book a short Zoom call at a time that suits you: ${callUrl}` : `Reply to this email with a few times that suit you and we'll set up a short Zoom call.`}

Or see it straight away
Fill in a short brief about your studio (logo, colours, classes and prices). There's a £5 fee, just so we know you're serious, and you'll have a working demo in your brand within ${DEMO_DAYS} days:
${briefUrl}

Any questions, just reply to this email.

Tim
Founder, Taal`;
  return { html, text: textBody };
}

export function paidEmail({ first, studio, when }) {
  const html = layout(`<p style="margin:0 0 16px">Hi ${esc(first)},</p>
<p style="margin:0 0 16px">Thanks, we have your brief and your £5 payment. Your demo for ${esc(studio)} will be with you by <b>${esc(when)}</b>.</p>
<p style="margin:0 0 16px">If we need anything else, like a better copy of your logo, we'll email you. Stripe sends your receipt separately.</p>
<p style="margin:0">Tim<br><span style="color:${C.mute}">Founder, Taal</span></p>`);
  return { html, text: `Hi ${first},\n\nThanks, we have your brief and your £5 payment. Your demo for ${studio} will be with you by ${when}.\n\nIf we need anything else, like a better copy of your logo, we'll email you. Stripe sends your receipt separately.\n\nTim\nFounder, Taal` };
}

async function notify(env, subject, rows) {
  if (!env.CONTACT_EMAIL || !env.CONTACT_EMAIL.includes('@')) return;
  const list = rows.filter(([, v]) => v);
  await sendEmail(env, {
    to: env.CONTACT_EMAIL,
    subject,
    html: layout(list.map(([k, v]) => `<p style="margin:0 0 12px"><b>${esc(k)}</b><br>${esc(v).replace(/\n/g, '<br>')}</p>`).join('')),
    text: list.map(([k, v]) => `${k}:\n${v}`).join('\n\n'),
  });
}

async function sendEmail(env, { to, subject, html, text: plain, replyTo }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.log(`[email not sent: no key] to=${to} subject="${subject}"`);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html, text: plain, reply_to: replyTo && replyTo.includes('@') ? replyTo : undefined }),
    });
    if (!res.ok) console.error('resend', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('resend', err);
    return false;
  }
}

/* ---------- Helpers ---------- */

class Reply { constructor(res) { this.res = res; } }
function fail(status, error) { throw new Reply(json({ error }, status)); }

function json(b, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

async function body(request) {
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) return request.json().catch(() => ({}));
  const f = await request.formData().catch(() => null);
  return f ? Object.fromEntries(f) : {};
}

function text(v, max, label) {
  const s = String(v || '').trim();
  if (!s) fail(400, `Add ${label}.`);
  return s.slice(0, max);
}

function email(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) || s.length > 200) fail(400, 'Check your email address.');
  return s;
}

async function rateLimit(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const key = `rl:${ip}:${new Date().toISOString().slice(0, 13)}`;
  const n = Number(await env.ENQUIRIES.get(key)) || 0;
  if (n >= 5) fail(429, 'That is a lot of enquiries in one hour. Please email us instead.');
  await env.ENQUIRIES.put(key, String(n + 1), { expirationTtl: 3700 });
}

async function getJSON(env, key) {
  const v = await env.ENQUIRIES.get(key);
  return v ? JSON.parse(v) : null;
}

async function getEnquiry(env, id) {
  if (!/^[0-9a-f]{32}$/.test(String(id))) fail(404, 'We could not find that enquiry. Use the link in your email.');
  const rec = await getJSON(env, `enq:${id}`);
  if (!rec) fail(404, 'We could not find that enquiry. Use the link in your email.');
  return rec;
}

/** The record, plus a small summary as KV metadata so the admin list needs one call. */
async function putEnquiry(env, rec) {
  const metadata = {
    studio: rec.studio.slice(0, 80), name: rec.name.slice(0, 80), email: rec.email.slice(0, 120),
    members: rec.members, created_at: rec.created_at, brief: rec.brief, demo_due: rec.demo_due || null,
  };
  await env.ENQUIRIES.put(`enq:${rec.id}`, JSON.stringify(rec), { expirationTtl: YEAR, metadata });
}

async function stripe(env, method, path, params) {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(params ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body: params ? new URLSearchParams(params).toString() : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('stripe', res.status, JSON.stringify(data));
    fail(502, 'Payment is not available right now. Please try again shortly, or email us.');
  }
  return data;
}

function origin(env, url) {
  return (env.PUBLIC_URL || url.origin).replace(/\/$/, '');
}

function token() {
  return hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafe(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function longDate(d) {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
