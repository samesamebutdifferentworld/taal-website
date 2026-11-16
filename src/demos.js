/**
 * Studios build their own demo on /demo.html.
 *
 * POST /api/build              the builder form (multipart, with an optional logo). Builds the demo in
 *                              the booking app through the BOOKING service binding, saves the studio as
 *                              a lead, emails them the links and tells you.
 * GET  /api/admin/leads        everyone who has built a demo (Bearer ADMIN_KEY), for /admin.html.
 *
 * Leads live in the ENQUIRIES KV namespace and are deleted after a year; the demos themselves are
 * deleted by the booking app after 30 days. Email goes through Resend (RESEND_API_KEY, EMAIL_FROM);
 * without a key nothing is sent and the page shows the links on screen.
 */

const YEAR = 365 * 86400;
const DEMO_DAYS = 30;
const MAX_LOGO = 1.8 * 1024 * 1024;
const KINDS = { fitness: 'Fitness', wellness: 'Wellness', yoga: 'Yoga', pilates: 'Pilates', dance: 'Dance', sauna: 'Sauna', martial: 'Martial arts' };
const FONTS = ['elegant', 'modern', 'bold'];

export async function demos(request, env, url) {
  const p = url.pathname;
  try {
    if (p === '/api/build' && request.method === 'POST') return await build(request, env, url);
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
    // Only the email is required; everything else has a sensible default.
    name: get('name').slice(0, 80),
    email: email(get('email')),
    studio: get('studio').slice(0, 60) || 'Your studio',
    kind: KINDS[get('kind')] ? get('kind') : 'fitness',
    colour: hex(get('colour')) || '#135855',
    accent: hex(get('accent')) || '#D8BF8C',
    font: FONTS.includes(get('font')) ? get('font') : 'modern',
    classes: get('classes').split('\n').map((l) => l.trim().slice(0, 40)).filter(Boolean).slice(0, 12),
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
    classes: lead.classes,
    books: lead.books,
    offpeak: lead.offpeak,
    gift_cards: lead.gift_cards,
    logo,
    cta_url: callUrl || `${base}/demo.html#call`,
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
    call_url: callUrl,
  };
  const id = token();
  const rec = { id, ...lead, has_logo: !!logo, ...links, created_at: new Date().toISOString() };
  await env.ENQUIRIES.put(`lead:${id}`, JSON.stringify(rec), {
    expirationTtl: YEAR,
    metadata: { studio: lead.studio, name: lead.name, email: lead.email, kind: lead.kind, created_at: rec.created_at, member_url: links.member_url, admin_url: links.admin_url, expires_at: links.expires_at },
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
    ['Their app', links.member_url], ['Back office', links.admin_url], ['Deleted on', until],
  ]);
  return json({ ok: true, name: made.name, emailed, ...links, contact: env.CONTACT_EMAIL && env.CONTACT_EMAIL.includes('@') ? env.CONTACT_EMAIL : '' });
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

const C = { paper: '#F2F3EE', ink: '#13201E', mute: '#55625F', green: '#0F5C57' };

function layout(inner) {
  return `<!doctype html><html><body style="margin:0;background:${C.paper};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${C.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:20px"><tr><td style="padding:36px 32px;font-size:16px;line-height:1.55">
<p style="margin:0 0 24px;font-weight:700;font-size:18px;color:${C.green}">taal</p>
${inner}
</td></tr></table>
<p style="margin:20px 0 0;font-size:12px;color:${C.mute}">taal, studio software made in London.</p>
</td></tr></table></body></html>`;
}

const button = (href, label, solid = true) =>
  `<a href="${esc(href)}" style="display:inline-block;padding:13px 22px;border-radius:999px;text-decoration:none;font-weight:600;${solid ? `background:${C.green};color:#fff` : `color:${C.green};border:1.5px solid ${C.green}`}">${esc(label)}</a>`;

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

async function notify(env, subject, rows) {
  if (!env.CONTACT_EMAIL || !env.CONTACT_EMAIL.includes('@')) return;
  const list = rows.filter(([, v]) => v);
  await sendEmail(env, {
    to: env.CONTACT_EMAIL,
    subject,
    html: layout(list.map(([k, v]) => `<p style="margin:0 0 12px"><b>${esc(k)}</b><br>${esc(v)}</p>`).join('')),
    text: list.map(([k, v]) => `${k}: ${v}`).join('\n'),
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

function email(v) {
  const s = v.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) || s.length > 200) fail(400, 'Check your email address.');
  return s;
}

const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : '');
const time = (v, d) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d);

/** Three demos an hour from one connection, and three a day for one email address. */
async function limit(request, env, address) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const now = new Date().toISOString();
  const keys = [[`rl:ip:${ip}:${now.slice(0, 13)}`, 3, 3700], [`rl:em:${address}:${now.slice(0, 10)}`, 3, 90000]];
  for (const [k, max] of keys) {
    if ((Number(await env.ENQUIRIES.get(k)) || 0) >= max) fail(429, "You've built a few demos already today. Use the links in your email, or try again tomorrow.");
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

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
