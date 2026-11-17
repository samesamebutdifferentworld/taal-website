/**
 * Studios build their own demo on /demo.
 *
 * POST /api/build              the builder form (multipart, with an optional logo). Builds the demo in
 *                              the booking app through the BOOKING service binding, saves the studio as
 *                              a lead, emails them the links and tells you.
 * POST /api/call               "Arrange a call" from the pricing section: saves the studio as a lead, emails
 *                              them how to book a time (CALL_URL, or reply with times) and tells you.
 * POST /api/cal                Cal.com webhook (signed with CAL_WEBHOOK_SECRET): bookings, reschedules and
 *                              cancellations of the "Call with Tim" event, saved as leads.
 * GET  /api/admin/leads        everyone who has built a demo, asked for or booked a call (Bearer ADMIN_KEY),
 *                              for /admin.html.
 * followUps(env)               run daily by the cron: one friendly nudge three days after a demo, unless
 *                              they have booked a call since.
 *
 * Partners: a partner's code (?ref=sam, from taal.solutions/r/sam) is saved with every demo and call it
 * leads to, so commission is clear. It travels in the page address and the Cal.com booking, never in a
 * cookie.
 *
 * Leads live in the ENQUIRIES KV namespace and are deleted after a year; the demos themselves are
 * deleted by the booking app after 30 days. Email goes through Resend (RESEND_API_KEY, EMAIL_FROM);
 * without a key nothing is sent and the page shows the links on screen.
 */

import { C, layout, button, esc, sendEmail, notify } from './mail.js';

const YEAR = 365 * 86400;
const DEMO_DAYS = 30;
const MAX_LOGO = 1.8 * 1024 * 1024;
const KINDS = { fitness: 'Fitness', wellness: 'Wellness', yoga: 'Yoga and Pilates', pilates: 'Pilates', dance: 'Dance', martial: 'Martial arts', climbing: 'Climbing' };
const FONTS = ['elegant', 'modern', 'bold'];

export async function demos(request, env, url) {
  const p = url.pathname;
  try {
    if (p === '/api/build' && request.method === 'POST') return await build(request, env, url);
    if (p === '/api/call' && request.method === 'POST') return await callRequest(request, env);
    if (p === '/api/cal' && request.method === 'POST') return await calWebhook(request, env);
    if (p === '/api/admin/leads' && request.method === 'GET') return await leads(request, env);
  } catch (err) {
    if (err instanceof Reply) return err.res;
    console.error(err);
    return json({ error: 'Something went wrong. Please try again in a minute.' }, 500);
  }
  return null;
}

async function build(request, env, url) {
  const form = await request.formData().catch(() => fail(400, 'Please try sending that again.'));
  const get = (k) => String(form.get(k) || '').trim();
  // A hidden field people never see; bots fill it in.
  if (get('website')) return json({ error: 'Please try again.' }, 400);

  const lead = {
    // The email and a first name are asked for; everything else has a sensible default.
    name: get('name').slice(0, 80),
    email: email(get('email')),
    studio: get('studio').slice(0, 60) || 'Your studio',
    ref: refFrom(request, get('ref')),
    kind: KINDS[get('kind')] ? get('kind') : 'fitness',
    colour: hex(get('colour')) || '#135855',
    accent: hex(get('accent')) || '#D8BF8C',
    font: FONTS.includes(get('font')) ? get('font') : 'modern',
    books: ['classes', 'appointments', 'both'].includes(get('books')) ? get('books') : 'both',
    gift_cards: get('gift_cards') !== 'off',
    offpeak: get('offpeak') === 'on' ? {
      open: time(get('op_open'), '10:00'),
      close: time(get('op_close'), '16:00'),
      weekends: get('op_weekends') === 'on',
      price: Math.round(Math.min(Math.max(Number(get('op_price')) || 45, 5), 500) * 100),
    } : null,
  };

  let logo = null;
  const file = form.get('logo');
  if (file && typeof file === 'object' && file.size) {
    if (file.size > MAX_LOGO) fail(400, 'Your logo is over 1.8 MB. Try a smaller file, or leave it out for now.');
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type || '')) fail(400, 'Logos can be PNG, JPG, SVG or WebP.');
    logo = { type: file.type, data: await file.arrayBuffer() };
  }

  if (!env.BOOKING || !env.BOOKING_URL) fail(503, 'Building demos is not switched on here yet.');
  await limit(request, env, lead.email);

  const base = origin(env, url);
  const callUrl = env.CALL_URL || '';
  let made;
  try {
    made = await env.BOOKING.create({
    name: lead.studio,
    kind: lead.kind,
    brand_color: lead.colour,
    accent_color: lead.accent,
    font: lead.font,
    // Class names come from the studio type; the demo greets them by their first name.
    first_name: lead.name.split(/\s+/)[0] || undefined,
    books: lead.books,
    offpeak: lead.offpeak,
    gift_cards: lead.gift_cards,
    logo,
    // The demo's own Book a call button, with their details filled in.
    cta_url: callUrl ? withDetails(callUrl, { name: lead.name, email: lead.email, studio: lead.studio, ref: lead.ref }) : `${base}/demo#call`,
    days: DEMO_DAYS,
    });
  } catch (err) {
    console.error('booking app', err);
    made = null;
  }
  if (!made || !made.ok) fail(400, (made && made.error) || 'Your demo could not be built just now. Please try again in a minute.');

  const app = env.BOOKING_URL.replace(/\/$/, '');
  const links = {
    slug: made.slug,
    member_url: `${app}/?s=${made.slug}`,
    admin_url: `${app}/admin/?s=${made.slug}`,
    expires_at: made.expires_at,
    call_url: withDetails(callUrl, { name: lead.name, email: lead.email, studio: lead.studio, ref: lead.ref }),
  };
  const id = token();
  const rec = { id, ...lead, has_logo: !!logo, ...links, created_at: new Date().toISOString() };
  await env.ENQUIRIES.put(`lead:${id}`, JSON.stringify(rec), {
    expirationTtl: YEAR,
    metadata: { type: 'demo', studio: lead.studio, name: lead.name, email: lead.email, kind: lead.kind, ref: lead.ref, created_at: rec.created_at, member_url: links.member_url, admin_url: links.admin_url, expires_at: links.expires_at },
  });

  const until = longDate(new Date(made.expires_at));
  const emailed = await sendEmail(env, {
    to: lead.email,
    subject: `Your ${made.name} demo is ready`,
    replyTo: env.CONTACT_EMAIL,
    ...readyEmail({ first: lead.name ? lead.name.split(' ')[0] : 'there', studio: made.name, ...links, until, contact: env.CONTACT_EMAIL }),
  });
  await notify(env, `New demo: ${made.name}`, [
    ['Name', lead.name], ['Email', lead.email], ['Studio', made.name], ['Type', KINDS[lead.kind]],
    ['Their app', links.member_url], ['Back office', links.admin_url], ['Deleted on', until], ['Partner', lead.ref],
  ]);
  return json({ ok: true, name: made.name, emailed, ...links, contact: env.CONTACT_EMAIL && env.CONTACT_EMAIL.includes('@') ? env.CONTACT_EMAIL : '' });
}

async function callRequest(request, env) {
  const b = await request.json().catch(() => fail(400, 'Please try sending that again.'));
  const get = (k, max) => String(b[k] || '').trim().slice(0, max);
  // A hidden field people never see; bots fill it in.
  if (get('website', 200)) return json({ ok: true, call_url: '' });
  const lead = {
    type: 'call',
    name: get('name', 80),
    email: email(get('email', 200)),
    studio: get('studio', 60),
    phone: get('phone', 30),
    note: get('note', 1500),
    package: get('package', 200),
    ref: refFrom(request, get('ref', 40)),
  };
  if (!lead.name) fail(400, 'Add your name.');
  if (!lead.studio) fail(400, "Add your studio's name.");
  await limit(request, env, lead.email, "You've already asked for a call today. We'll be in touch soon.", 'rc');

  const callUrl = env.CALL_URL || '';
  const id = token();
  const rec = { id, ...lead, created_at: new Date().toISOString() };
  await env.ENQUIRIES.put(`lead:${id}`, JSON.stringify(rec), {
    expirationTtl: YEAR,
    metadata: { type: 'call', studio: lead.studio, name: lead.name, email: lead.email, phone: lead.phone, package: lead.package, ref: lead.ref, created_at: rec.created_at },
  });
  const emailed = await sendEmail(env, {
    to: lead.email,
    subject: `A call about ${lead.studio}`,
    replyTo: env.CONTACT_EMAIL,
    ...callEmail({ first: lead.name.split(' ')[0], studio: lead.studio, call_url: withDetails(callUrl, lead) }),
  });
  await notify(env, `Call request: ${lead.studio}`, [
    ['Name', lead.name], ['Email', lead.email], ['Phone', lead.phone], ['Studio', lead.studio],
    ['Looking at', lead.package], ['Note', lead.note], ['Partner', lead.ref],
  ]);
  return json({ ok: true, emailed, call_url: callUrl });
}

/* ---------- Partners ---------- */

// Partner codes: 2 to 30 letters, numbers or dashes, e.g. "sam" or "sam-k".
export function cleanRef(v) {
  const s = String(v || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,29}$/.test(s) ? s : '';
}

// The code comes in the form, or in the address of the page the form was sent from.
function refFrom(request, given) {
  if (cleanRef(given)) return cleanRef(given);
  try { return cleanRef(new URL(request.headers.get('referer') || '').searchParams.get('ref')); } catch { return ''; }
}

/* ---------- Cal.com bookings ---------- */

async function calWebhook(request, env) {
  if (!env.CAL_WEBHOOK_SECRET) fail(503, 'Cal.com bookings are not connected yet.');
  const raw = await request.text();
  const sig = (request.headers.get('x-cal-signature-256') || '').trim().toLowerCase();
  if (!sig || !timingSafe(sig, await hmacHex(env.CAL_WEBHOOK_SECRET, raw))) fail(401, 'Bad signature');
  let body; try { body = JSON.parse(raw); } catch { fail(400, 'Bad JSON'); }
  const event = body.triggerEvent || '';
  const p = body.payload || {};
  if (event === 'PING' || !p.uid) return json({ ok: true });
  const key = `lead:cal-${String(p.uid).slice(0, 80)}`;

  if (event === 'BOOKING_CANCELLED') {
    const got = await env.ENQUIRIES.getWithMetadata(key);
    if (got && got.value) await env.ENQUIRIES.put(key, got.value, { expirationTtl: YEAR, metadata: { ...(got.metadata || {}), cancelled: true } });
    return json({ ok: true });
  }
  if (event !== 'BOOKING_CREATED' && event !== 'BOOKING_RESCHEDULED') return json({ ok: true });

  const val = (x) => (x && typeof x === 'object' ? (x.value ?? '') : (x ?? ''));
  const r = p.responses || {};
  const who = (p.attendees && p.attendees[0]) || {};
  const notes = String(val(r.notes) || p.additionalNotes || p.description || '').slice(0, 600);
  const lead = {
    type: 'call',
    booked: true,
    name: String(val(r.name) || who.name || '').slice(0, 80),
    email: String(val(r.email) || who.email || '').toLowerCase().slice(0, 200),
    studio: String(val(r.studio) || '').slice(0, 60) || String(val(r.name) || who.name || 'Call').slice(0, 60),
    package: notes.replace(/^Looking at:\s*/i, '').slice(0, 200),
    ref: cleanRef(p.metadata && p.metadata.ref) || cleanRef((notes.match(/partner:\s*([a-z0-9-]+)/i) || [])[1]),
    call_at: p.startTime || '',
    created_at: new Date().toISOString(),
  };
  // A reschedule replaces the booking it moved.
  const old = p.rescheduleUid || p.fromReschedule || (p.rescheduledBy && p.rescheduleId);
  if (old && typeof old === 'string') await env.ENQUIRIES.delete(`lead:cal-${old.slice(0, 80)}`);
  await env.ENQUIRIES.put(key, JSON.stringify({ id: key.slice(5), ...lead, notes }), { expirationTtl: YEAR, metadata: lead });
  return json({ ok: true });
}

async function hmacHex(secret, data) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- Follow-up ---------- */

const DAY = 86400 * 1000;

// Three days after a demo, one short nudge to book a call, unless they already have. Sent once, and only
// in the 3 to 10 day window, so a missed day doesn't pile up old ones.
export async function followUps(env, now = Date.now()) {
  if (!env.ENQUIRIES) return 0;
  const all = [];
  let cursor;
  do {
    const page = await env.ENQUIRIES.list({ prefix: 'lead:', cursor });
    all.push(...page.keys);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && all.length < 5000);
  const called = new Set(all.filter((k) => k.metadata && k.metadata.type === 'call' && k.metadata.email).map((k) => k.metadata.email.toLowerCase()));
  let n = 0;
  for (const k of all) {
    const m = k.metadata || {};
    if (m.type === 'call' || m.nudged || !m.email || !m.member_url) continue;
    const age = now - Date.parse(m.created_at);
    if (!(age >= 3 * DAY && age < 10 * DAY)) continue;
    if (m.expires_at && Date.parse(m.expires_at) < now) continue;
    if (called.has(m.email.toLowerCase())) { await mark(env, k.name, m); continue; }
    const sentOk = await sendEmail(env, {
      to: m.email,
      subject: `How did the ${m.studio} demo look?`,
      replyTo: env.CONTACT_EMAIL,
      ...nudgeEmail({
        first: m.name ? m.name.split(' ')[0] : 'there', studio: m.studio, member_url: m.member_url,
        until: m.expires_at ? longDate(new Date(m.expires_at)) : '',
        call_url: withDetails(env.CALL_URL || '', { name: m.name, email: m.email, studio: m.studio, ref: m.ref }),
      }),
    });
    if (sentOk) { await mark(env, k.name, m); n++; }
  }
  return n;
}

async function mark(env, key, meta) {
  const value = await env.ENQUIRIES.get(key);
  if (value == null) return;
  const left = Math.max(60, Math.round((Date.parse(meta.created_at) + YEAR * 1000 - Date.now()) / 1000));
  await env.ENQUIRIES.put(key, value, { expirationTtl: left, metadata: { ...meta, nudged: true } });
}

async function leads(request, env) {
  const auth = request.headers.get('authorization') || '';
  if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 16 || !timingSafe(auth, `Bearer ${env.ADMIN_KEY}`)) return json({ error: 'Not signed in' }, 401);
  const out = [];
  let cursor;
  do {
    const page = await env.ENQUIRIES.list({ prefix: 'lead:', cursor });
    for (const k of page.keys) out.push({ id: k.name.slice(5), ...(k.metadata || {}) });
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && out.length < 5000);
  out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return json({ leads: out });
}

/* ---------- Emails ---------- */

export function readyEmail({ first, studio, member_url, admin_url, call_url, until }) {
  const call = call_url
    ? `<p style="margin:0 0 14px">When you've had a look, book a short call. We'll show you how it would work with your real timetable, prices and team.</p><p style="margin:0 0 28px">${button(call_url, 'Book a call', false)}</p>`
    : `<p style="margin:0 0 28px">When you've had a look, reply to this email with a few times that suit you and we'll set up a short call. We'll show you how it would work with your real timetable, prices and team.</p>`;
  const html = layout(`<p style="margin:0 0 16px">Hi ${esc(first)},</p>
<p style="margin:0 0 20px">Your demo of ${esc(studio)} is ready. It has sample classes, members and bookings, so you can try everything: book as a member, then switch to a coach or the owner with the bar at the top.</p>
<p style="margin:0 0 12px">${button(member_url, 'Open your app')}</p>
<p style="margin:0 0 28px"><a href="${esc(admin_url)}" style="color:${C.green};font-weight:600">Open the back office</a></p>
<p style="margin:0 0 6px"><b>Next: a quick call</b></p>
${call}
<p style="margin:0;color:${C.mute};font-size:14px">Your demo is private to you and stays up until ${esc(until)}.</p>
<p style="margin:16px 0 0">Tim<br><span style="color:${C.mute}">Founder, taal</span></p>`);
  const text = `Hi ${first},

Your demo of ${studio} is ready. It has sample classes, members and bookings, so you can try everything: book as a member, then switch to a coach or the owner with the bar at the top.

Your app: ${member_url}
The back office: ${admin_url}

Next: a quick call
${call_url ? `When you've had a look, book a short call: ${call_url}` : `When you've had a look, reply to this email with a few times that suit you and we'll set up a short call.`}
We'll show you how it would work with your real timetable, prices and team.

Your demo is private to you and stays up until ${until}.

Tim
Founder, taal`;
  return { html, text };
}

export function nudgeEmail({ first, studio, member_url, call_url, until }) {
  const book = call_url
    ? `<p style="margin:0 0 28px">${button(call_url, 'Book a 20 minute call')}</p>`
    : `<p style="margin:0 0 28px">Just reply with a few times that suit you.</p>`;
  const html = layout(`<p style="margin:0 0 16px">Hi ${esc(first)},</p>
<p style="margin:0 0 16px">Did you get a chance to try your ${esc(studio)} demo? If you'd like to see it with your real timetable, prices and team, or just ask a few questions, I'm happy to show you on a short video call.</p>
${book}
<p style="margin:0 0 6px"><a href="${esc(member_url)}" style="color:${C.green};font-weight:600">Open your demo again</a></p>
${until ? `<p style="margin:0;color:${C.mute};font-size:14px">It stays up until ${esc(until)}.</p>` : ''}
<p style="margin:16px 0 0">Tim<br><span style="color:${C.mute}">Founder, taal</span></p>`);
  const text = `Hi ${first},

Did you get a chance to try your ${studio} demo? If you'd like to see it with your real timetable, prices and team, or just ask a few questions, I'm happy to show you on a short video call.

${call_url ? `Book a 20 minute call: ${call_url}` : 'Just reply with a few times that suit you.'}

Your demo: ${member_url}${until ? `\nIt stays up until ${until}.` : ''}

Tim
Founder, taal`;
  return { html, text };
}

export function callEmail({ first, studio, call_url }) {
  const next = call_url
    ? `<p style="margin:0 0 14px">Pick a time that suits you. It's a short video call: we'll answer your questions and show you how it would work with your real timetable, prices and team.</p><p style="margin:0 0 28px">${button(call_url, 'Book a time')}</p>`
    : `<p style="margin:0 0 28px">Reply to this email with a few times that suit you and we'll set up a short video call. We'll answer your questions and show you how it would work with your real timetable, prices and team.</p>`;
  const html = layout(`<p style="margin:0 0 16px">Hi ${esc(first)},</p>
<p style="margin:0 0 20px">Thanks for asking about a call for ${esc(studio)}.</p>
${next}
<p style="margin:0;color:${C.mute};font-size:14px">Want to look first? You can build a free demo of your own app in about a minute on our website.</p>
<p style="margin:16px 0 0">Tim<br><span style="color:${C.mute}">Founder, taal</span></p>`);
  const text = `Hi ${first},

Thanks for asking about a call for ${studio}.

${call_url ? `Pick a time that suits you: ${call_url}` : `Reply to this email with a few times that suit you and we'll set up a short video call.`}
We'll answer your questions and show you how it would work with your real timetable, prices and team.

Want to look first? You can build a free demo of your own app in about a minute on our website.

Tim
Founder, taal`;
  return { html, text };
}

// Cal.com fills in name, email and the studio question (identifier "studio") from the link.
function withDetails(link, { name, email, studio, ref }) {
  if (!link) return '';
  try {
    const u = new URL(link);
    if (name) u.searchParams.set('name', name);
    if (email) u.searchParams.set('email', email);
    if (studio) u.searchParams.set('studio', studio);
    if (ref) u.searchParams.set('metadata[ref]', ref);
    return u.toString();
  } catch { return link; }
}

/* ---------- Helpers ---------- */

class Reply { constructor(res) { this.res = res; } }
function fail(status, error) { throw new Reply(json({ error }, status)); }

function json(b, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

function email(v) {
  const s = v.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) || s.length > 200) fail(400, 'Check your email address.');
  return s;
}

const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : '');
const time = (v, d) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d);

/** Three demos an hour from one connection, and three a day for one email address. */
async function limit(request, env, address, message = "You've built a few demos already today. Use the links in your email, or try again tomorrow.", prefix = 'rl') {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const now = new Date().toISOString();
  const keys = [[`${prefix}:ip:${ip}:${now.slice(0, 13)}`, 3, 3700], [`${prefix}:em:${address}:${now.slice(0, 10)}`, 3, 90000]];
  for (const [k, max] of keys) {
    if ((Number(await env.ENQUIRIES.get(k)) || 0) >= max) fail(429, message);
  }
  for (const [k, , ttl] of keys) await env.ENQUIRIES.put(k, String((Number(await env.ENQUIRIES.get(k)) || 0) + 1), { expirationTtl: ttl });
}

function origin(env, url) {
  return (env.PUBLIC_URL || url.origin).replace(/\/$/, '');
}

function token() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
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
