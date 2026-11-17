/**
 * From signed to live: everything after a studio says yes.
 *
 * Each studio that's offered an agreement gets a private portal at taal.solutions/client/<token>:
 * they sign there, see their invoices, upload what their build needs, tick off the accounts they set
 * up, review their demo and approve it. You run it from the Clients tab on /admin.html.
 *
 * Studio (the token in the address is the key):
 *   GET    /api/client/<token>                   their portal: order, stage, brief, files, invoices
 *   GET    /api/client/<token>/agreement         the agreement, filled in, to read before signing
 *   POST   /api/client/<token>/sign              sign it: name, title, address, typed signature
 *   PUT    /api/client/<token>/brief             save one part of what they've filled in (autosave)
 *   POST   /api/client/<token>/files             upload a file (multipart: section, file)
 *   GET    /api/client/<token>/files/<fid>       see a file they uploaded
 *   DELETE /api/client/<token>/files/<fid>       remove one
 *   POST   /api/client/<token>/submit            "That's everything for now": tells you
 *   POST   /api/client/<token>/accounts          tick an account as set up
 *   POST   /api/client/<token>/approve           approve the demo for go-live
 *   POST   /api/client/<token>/request           ask for a change to the demo
 *   GET    /agreement/<token>                     the agreement as a page to print or save as PDF
 *
 * You (Bearer ADMIN_KEY):
 *   GET    /api/admin/clients                    every studio, newest first
 *   POST   /api/admin/clients                    offer an agreement (and email it)
 *   GET    /api/admin/clients/<id>               one studio in full
 *   POST   /api/admin/clients/<id>               an action: countersign, demo, review, live, note, ...
 *   GET    /api/admin/clients/<id>/files/<fid>   download one of their files
 *   POST   /api/admin/leads/<id>                 a lead's call summary note, hold, or closed
 *
 * Stripe (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET; optional): invoices go out when a studio signs and
 * when it goes live, monthly plans and the care plan are Direct Debit links, and POST /api/stripe
 * marks them paid. Without a key every invoice is listed for you to send by hand.
 *
 * Kept in the CLIENTS KV namespace, never deleted automatically:
 *   client:<id>   the record      token:<token>   its id      file:<id>:<fid>   an upload
 *   signed:<id>   the exact agreement they signed, as HTML
 */
import { agreementHtml, AGREEMENT_CSS, VERSION } from './agreement.js';
import { quote, gbp, payLine, PLANS } from './prices.js';
import { esc, frame, button, p, small, heading, sign, steps, rows, sendEmail, notify } from './mail.js';

const DAY = 86400 * 1000;
const MAX_FILE = 15 * 1024 * 1024;
const MAX_FILES = 80;
export const STAGES = ['offered', 'signed', 'building', 'review', 'approved', 'live'];
export const STAGE_LABEL = { offered: 'Agreement sent', signed: 'Signed', building: 'Building', review: 'In review', approved: 'Approved', live: 'Live' };
const SECTIONS = ['logo', 'photos', 'team', 'fonts', 'members', 'other'];
const ACCOUNTS = ['cloudflare', 'stripe', 'resend', 'domain', 'apple', 'google'];

export async function clients(request, env, url) {
  const path = url.pathname;
  try {
    let m;
    if ((m = path.match(/^\/api\/client\/([a-f0-9]{32})(?:\/(.*))?$/))) return await portal(request, env, url, m[1], m[2] || '');
    if (path === '/api/stripe' && request.method === 'POST') return await stripeWebhook(request, env);
    if (path.startsWith('/api/admin/clients') || /^\/api\/admin\/leads\/[^/]+$/.test(path)) {
      if (!admin(request, env)) return json({ error: 'Not signed in' }, 401);
      if (path === '/api/admin/clients' && request.method === 'GET') return json({ clients: await listClients(env) });
      if (path === '/api/admin/clients' && request.method === 'POST') return await offer(request, env);
      if ((m = path.match(/^\/api\/admin\/clients\/([a-z0-9]+)\/files\/([a-z0-9]+)$/))) return await fileOut(env, m[1], m[2], true);
      if ((m = path.match(/^\/api\/admin\/clients\/([a-z0-9]+)$/))) {
        const c = await load(env, m[1]);
        if (!c) return json({ error: 'Not found' }, 404);
        if (request.method === 'GET') return json({ client: await full(env, c) });
        if (request.method === 'POST') return await act(request, env, c);
      }
      if ((m = path.match(/^\/api\/admin\/leads\/([^/]+)$/)) && request.method === 'POST') return await leadUpdate(request, env, decodeURIComponent(m[1]));
    }
  } catch (err) {
    if (err instanceof Reply) return err.res;
    console.error(err);
    return json({ error: 'Something went wrong. Please try again in a minute.' }, 500);
  }
  return null;
}

/** The printable agreement: taal.solutions/agreement/<token>. */
export async function agreementPage(env, token) {
  const c = await byToken(env, token);
  if (!c) return new Response('Not found', { status: 404 });
  const signedCopy = c.signed ? await env.CLIENTS.get(`signed:${c.id}`) : null;
  const body = signedCopy ? withSignatures(signedCopy, c, env) : agreementHtml(c, env);
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Agreement: ${esc(c.studio)} and taal</title>
<style>@font-face { font-family:'Funnel Display'; src:url('/fonts/funnel-display.woff2') format('woff2'); font-weight:300 800; }
@font-face { font-family:'Funnel Sans'; src:url('/fonts/funnel-sans.woff2') format('woff2'); font-weight:300 800; }
body { margin:0; background:#F2F3EE; font-family:'Funnel Sans', system-ui, sans-serif; color:#13201E; }
.page { max-width:760px; margin:0 auto; padding:40px 24px 64px; }
.top { display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:28px; }
.top p { margin:0; color:#55625F; font-size:14px; }
.paper { background:#fff; border-radius:20px; padding:36px 34px; }
.audit { margin-top:18px; font-size:12.5px; color:#55625F; line-height:1.55; }
button { font:inherit; font-weight:600; background:#0F5C57; color:#fff; border:0; border-radius:999px; padding:10px 18px; cursor:pointer; }
${AGREEMENT_CSS}
@media print { body { background:#fff; } .page { padding:0; } .paper { padding:0; } .noprint { display:none; } @page { margin:18mm 16mm; } }
</style></head><body><div class="page">
<div class="top"><div><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4" width="3" height="16" rx="1.5" fill="#A8382B"/><rect x="8.5" y="7" width="3" height="10" rx="1.5" fill="#0F5C57"/><circle cx="15.5" cy="12" r="2.1" fill="none" stroke="#13201E" stroke-width="1.6"/><rect x="19.5" y="7" width="3" height="10" rx="1.5" fill="#0F5C57"/></svg> <b style="font-family:'Funnel Display';font-size:20px;vertical-align:4px">taal</b></div>
<button class="noprint" onclick="print()">Save as PDF or print</button></div>
<div class="paper">${body}${audit(c)}</div></div></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}

/* ---------- The studio's portal ---------- */

async function portal(request, env, url, token, rest) {
  const c = await byToken(env, token);
  if (!c) return json({ error: "This link doesn't work. Check the email we sent, or reply to it and we'll send a new one." }, 404);
  const method = request.method;
  if (rest === '' && method === 'GET') return json({ client: view(c, env) });
  if (rest === 'agreement' && method === 'GET') {
    const copy = c.signed ? await env.CLIENTS.get(`signed:${c.id}`) : null;
    return json({ html: copy ? withSignatures(copy, c, env) : agreementHtml(c, env), version: c.signed?.version || VERSION });
  }
  if (rest === 'sign' && method === 'POST') return signIt(request, env, c);
  if (rest === 'brief' && method === 'PUT') return saveBrief(request, env, c);
  if (rest === 'files' && method === 'POST') return upload(request, env, c);
  let m;
  if ((m = rest.match(/^files\/([a-z0-9]+)$/))) {
    if (method === 'GET') return fileOut(env, c.id, m[1], false);
    if (method === 'DELETE') return removeFile(env, c, m[1]);
  }
  if (rest === 'submit' && method === 'POST') return submitBrief(env, c);
  if (rest === 'accounts' && method === 'POST') return tickAccount(request, env, c);
  if (rest === 'approve' && method === 'POST') return approve(env, c);
  if (rest === 'request' && method === 'POST') return changeRequest(request, env, c);
  return json({ error: 'Not found' }, 404);
}

/** What the studio sees: everything except your notes and the audit details. */
function view(c, env) {
  const q = quote(c.order);
  return {
    studio: c.studio, name: c.name, email: c.email, stage: c.stage, stages: STAGES.map((s) => ({ key: s, label: STAGE_LABEL[s] })),
    order: c.order, quote: q, pay_line: payLine(q), plan_label: PLANS[q.plan],
    signed: c.signed ? { name: c.signed.name, at: c.signed.at } : null,
    countersigned: c.countersigned ? { name: c.countersigned.name, at: c.countersigned.at } : null,
    party: c.party || null,
    invoices: (c.invoices || []).map(({ kind, label, amount, url: link, status, at }) => ({ kind, label, amount, url: link, status, at })),
    brief: c.brief || {}, brief_submitted: c.brief_submitted || null,
    files: (c.files || []).map(({ id, section, name, type, size }) => ({ id, section, name, type, size })),
    accounts: c.accounts || {}, needs: accountsFor(c),
    demo: c.review_sent ? c.demo : null, review_sent: c.review_sent || null, approved: c.approved || null,
    requests: c.requests || [], live_at: c.live_at || null, go_live: c.go_live || '',
    contact: env.CONTACT_EMAIL || '',
  };
}

/** Which accounts this studio needs: store apps add Apple and Google. */
function accountsFor(c) {
  return ACCOUNTS.filter((a) => (a === 'apple' || a === 'google' ? c.order.apps : true));
}

async function signIt(request, env, c) {
  if (c.signed) fail(400, "You've already signed. Your copy is in the Agreement section.");
  const b = await request.json().catch(() => fail(400, 'Please try that again.'));
  const get = (k, max) => String(b[k] ?? '').trim().slice(0, max);
  const party = {
    legal_name: get('legal_name', 120), address: get('address', 300), company_number: get('company_number', 20),
    locations: get('locations', 300), care: b.care === true,
  };
  const s = { name: get('name', 80), title: get('title', 60), typed: get('signature', 80) };
  if (!party.legal_name) fail(400, "Add your studio's legal name: the company name, or your own name if you're a sole trader.");
  if (!party.address) fail(400, 'Add the address for the agreement.');
  if (!s.name) fail(400, 'Add your full name.');
  if (b.accept !== true) fail(400, 'Tick the box to say you agree.');
  if (norm(s.typed) !== norm(s.name)) fail(400, 'Type your full name exactly as above to sign.');

  const at = new Date().toISOString();
  c.party = party;
  c.order = { ...c.order, care: party.care };
  c.signed = {
    name: s.name, title: s.title, at, version: VERSION,
    email: c.email,
    ip: request.headers.get('cf-connecting-ip') || '',
    agent: (request.headers.get('user-agent') || '').slice(0, 200),
  };
  // The exact words they signed, and a fingerprint of them, kept for good.
  const copy = agreementHtml(c, env, party);
  c.signed.sha256 = await sha256(copy);
  await env.CLIENTS.put(`signed:${c.id}`, copy);
  c.stage = 'signed';
  log(c, `Signed by ${s.name}`);
  await invoiceAtSigning(env, c);
  await save(env, c);

  const link = portalUrl(env, c);
  await sendEmail(env, {
    to: c.email, replyTo: env.CONTACT_EMAIL,
    subject: `Welcome to taal, ${c.studio}`,
    ...welcomeEmail(env, c, link),
  });
  await notify(env, `Signed: ${c.studio}`, [
    ['Studio', `${c.studio} (${party.legal_name})`], ['Signed by', `${s.name}${s.title ? `, ${s.title}` : ''}`],
    ['Order', payLine(quote(c.order))], ['Care plan', party.care ? 'Yes' : 'No'],
    ['First invoice', firstInvoiceNote(c)],
  ], [`${origin(env)}/admin#client=${c.id}`, 'Countersign']);
  return json({ ok: true, client: view(c, env) });
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z\p{L}]/gu, '');

function firstInvoiceNote(c) {
  const inv = (c.invoices || [])[0];
  if (!inv) return '';
  return inv.status === 'manual' ? `${gbp(inv.amount)}: send it yourself (Stripe isn't connected)` : `${gbp(inv.amount)}, sent by Stripe`;
}

/* ---------- What they upload ---------- */

const BRIEF_PARTS = {
  studio: 'object', brand: 'object', classes: 'list', timetable: 'list', treatments: 'list',
  memberships: 'list', packs: 'list', team: 'list', website: 'object', members: 'object', notes: 'object',
};

async function saveBrief(request, env, c) {
  if (!c.signed) fail(400, 'Sign the agreement first.');
  const b = await request.json().catch(() => fail(400, 'Please try that again.'));
  const part = String(b.part || '');
  if (!BRIEF_PARTS[part]) fail(400, 'Unknown section.');
  const data = clean(b.data, 0);
  if (BRIEF_PARTS[part] === 'list' && !Array.isArray(data)) fail(400, 'Expected a list.');
  if (BRIEF_PARTS[part] === 'object' && (typeof data !== 'object' || Array.isArray(data) || data === null)) fail(400, 'Expected a section.');
  if (JSON.stringify(data).length > 60000) fail(400, "That section is too long to save. Split long copy into a file under 'Anything else'.");
  c.brief = { ...(c.brief || {}), [part]: data };
  c.brief_saved = new Date().toISOString();
  if (c.stage === 'signed') c.stage = 'building';
  await save(env, c);
  await firstUploadNote(env, c);
  return json({ ok: true, saved: c.brief_saved });
}

/** Strings trimmed and capped, objects and lists kept shallow, nothing else. */
function clean(v, depth) {
  if (depth > 3) return null;
  if (typeof v === 'string') return v.slice(0, 8000);
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => clean(x, depth + 1));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).slice(0, 40).map(([k, x]) => [String(k).slice(0, 40), clean(x, depth + 1)]));
  return null;
}

async function upload(request, env, c) {
  if (!c.signed) fail(400, 'Sign the agreement first.');
  const form = await request.formData().catch(() => fail(400, 'Please try that again.'));
  const section = SECTIONS.includes(String(form.get('section'))) ? String(form.get('section')) : 'other';
  const file = form.get('file');
  if (!file || typeof file !== 'object' || !file.size) fail(400, 'Choose a file.');
  if (file.size > MAX_FILE) fail(400, `${file.name} is over 15 MB. Make it smaller, or send a link to it under "Anything else".`);
  if ((c.files || []).length >= MAX_FILES) fail(400, "That's the most files we can take here. Send the rest as a link under \"Anything else\".");
  const okType = section === 'members'
    ? /\.(csv|xlsx|xls|txt|json)$/i.test(file.name)
    : section === 'fonts' ? /\.(otf|ttf|woff2?|zip)$/i.test(file.name)
      : section === 'other' ? true : /^image\/(png|jpeg|webp|svg\+xml|gif|heic|heif)$/.test(file.type || '') || /\.(heic|heif)$/i.test(file.name);
  if (!okType) fail(400, section === 'members' ? 'Member exports can be CSV or Excel.' : section === 'fonts' ? 'Fonts can be OTF, TTF, WOFF or a ZIP.' : 'Photos and logos can be PNG, JPG, WebP, SVG or HEIC.');
  const fid = token().slice(0, 12);
  const meta = { id: fid, section, name: String(file.name).slice(0, 120), type: file.type || 'application/octet-stream', size: file.size, at: new Date().toISOString() };
  await env.CLIENTS.put(`file:${c.id}:${fid}`, await file.arrayBuffer(), { metadata: meta });
  // One logo: a new one replaces the old.
  if (section === 'logo') for (const f of (c.files || []).filter((x) => x.section === 'logo')) await env.CLIENTS.delete(`file:${c.id}:${f.id}`);
  c.files = [...(c.files || []).filter((x) => !(section === 'logo' && x.section === 'logo')), meta];
  if (c.stage === 'signed') c.stage = 'building';
  await save(env, c);
  await firstUploadNote(env, c);
  return json({ ok: true, file: { id: fid, section, name: meta.name, type: meta.type, size: meta.size } });
}

async function removeFile(env, c, fid) {
  if (c.stage === 'live') fail(400, "You're live: email us to change anything now.");
  c.files = (c.files || []).filter((f) => f.id !== fid);
  await env.CLIENTS.delete(`file:${c.id}:${fid}`);
  await save(env, c);
  return json({ ok: true });
}

async function fileOut(env, id, fid, download) {
  const got = await env.CLIENTS.getWithMetadata(`file:${id}:${fid}`, { type: 'arrayBuffer' });
  if (!got || !got.value) return json({ error: 'Not found' }, 404);
  const m = got.metadata || {};
  // Their own files only show inline when they're pictures; everything else downloads.
  const inline = !download && /^image\/(png|jpeg|webp|gif)$/.test(m.type || '');
  return new Response(got.value, { headers: {
    'content-type': inline ? m.type : 'application/octet-stream',
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${String(m.name || 'file').replace(/["\\\r\n]/g, '')}"`,
    'cache-control': 'private, max-age=300', 'x-content-type-options': 'nosniff',
  } });
}

/** The first upload of the day tells you something's arriving; later ones don't. */
async function firstUploadNote(env, c) {
  const today = new Date().toISOString().slice(0, 10);
  if (c.upload_note_day === today) return;
  c.upload_note_day = today;
  await save(env, c);
  await notify(env, `${c.studio} is filling in their details`, [['Studio', c.studio], ['So far', briefSummary(c)]], [`${origin(env)}/admin#client=${c.id}`, 'Open in admin']);
}

/** What's still missing before the demo can be built, in their words. */
export function missing(c) {
  const b = c.brief || {}, f = c.files || [];
  const has = (s) => f.some((x) => x.section === s);
  const list = (k) => (Array.isArray(b[k]) ? b[k].filter((x) => x && Object.values(x).some((v) => String(v ?? '').trim())) : []);
  const out = [];
  if (!has('logo')) out.push('Your logo');
  if (!b.brand?.colour) out.push('Your main colour');
  if (f.filter((x) => x.section === 'photos').length < 3) out.push('At least three photos');
  if (!b.studio?.about) out.push('A few lines about your studio');
  if (!b.studio?.address) out.push('Your address');
  if (!list('classes').length && !list('treatments').length) out.push('Your classes or treatments');
  if (list('classes').length && !list('timetable').length) out.push('Your timetable');
  if (!list('memberships').length && !list('packs').length && !list('treatments').some((t) => t.price)) out.push('Your prices');
  if (!list('team').length) out.push('Your team');
  if (!has('members') && !b.members?.none) out.push('Your member export (or tick that you have none)');
  return out;
}

function briefSummary(c) {
  const b = c.brief || {}, f = c.files || [];
  const n = (k) => (Array.isArray(b[k]) ? b[k].length : 0);
  return [`${n('classes')} classes`, `${n('timetable')} timetable slots`, `${n('treatments')} treatments`, `${n('memberships') + n('packs')} prices`, `${n('team')} team`, `${f.length} files`].join(', ');
}

async function submitBrief(env, c) {
  if (!c.signed) fail(400, 'Sign the agreement first.');
  const gaps = missing(c);
  c.brief_submitted = new Date().toISOString();
  if (c.stage === 'signed') c.stage = 'building';
  log(c, gaps.length ? `Sent their details, still missing: ${gaps.join(', ')}` : 'Sent all their details');
  await save(env, c);
  await notify(env, gaps.length ? `${c.studio} sent their details (some missing)` : `${c.studio} sent everything: ready to build`, [
    ['Studio', c.studio], ['What came in', briefSummary(c)], ['Still missing', gaps.join(', ')],
  ], [`${origin(env)}/admin#client=${c.id}`, 'Build their demo']);
  return json({ ok: true, missing: gaps, client: view(c, env) });
}

async function tickAccount(request, env, c) {
  const b = await request.json().catch(() => fail(400, 'Please try that again.'));
  const k = String(b.account || '');
  if (!ACCOUNTS.includes(k)) fail(400, 'Unknown account.');
  c.accounts = { ...(c.accounts || {}), [k]: b.done === true ? new Date().toISOString() : null };
  if (b.done === true) log(c, `Set up their ${k} account`);
  await save(env, c);
  if (b.done === true) {
    const left = accountsFor(c).filter((a) => !c.accounts[a]);
    await notify(env, `${c.studio} set up ${ACCOUNT_NAMES[k]}`, [['Studio', c.studio], ['Still to do', left.map((a) => ACCOUNT_NAMES[a]).join(', ') || 'None: all accounts ready']]);
  }
  return json({ ok: true, accounts: c.accounts });
}

export const ACCOUNT_NAMES = { cloudflare: 'Cloudflare', stripe: 'Stripe', resend: 'Resend', domain: 'their domain', apple: 'Apple Developer', google: 'Google Play' };

async function approve(env, c) {
  if (!c.review_sent) fail(400, "There's nothing to approve yet.");
  if (c.approved) return json({ ok: true, client: view(c, env) });
  c.approved = { at: new Date().toISOString() };
  c.stage = 'approved';
  log(c, 'Approved the demo');
  await save(env, c);
  await sendEmail(env, { to: c.email, replyTo: env.CONTACT_EMAIL, subject: `Approved: next, ${c.studio} goes live`, ...approvedEmail(env, c) });
  await notify(env, `Approved: ${c.studio}`, [['Studio', c.studio], ['Accounts ready', accountsFor(c).filter((a) => c.accounts?.[a]).map((a) => ACCOUNT_NAMES[a]).join(', ') || 'None yet'], ['Next', 'Connect their accounts and set the go-live date']], [`${origin(env)}/admin#client=${c.id}`, 'Open in admin']);
  return json({ ok: true, client: view(c, env) });
}

async function changeRequest(request, env, c) {
  const b = await request.json().catch(() => fail(400, 'Please try that again.'));
  const text = String(b.text || '').trim().slice(0, 3000);
  if (!text) fail(400, 'Write what you would like changed.');
  c.requests = [...(c.requests || []), { text, at: new Date().toISOString() }].slice(-50);
  log(c, 'Asked for a change');
  await save(env, c);
  await notify(env, `Change request: ${c.studio}`, [['Studio', c.studio], ['They asked', text]], [`${origin(env)}/admin#client=${c.id}`, 'Open in admin']);
  return json({ ok: true, requests: c.requests });
}

/* ---------- Your side ---------- */

async function offer(request, env) {
  const b = await request.json().catch(() => fail(400, 'Bad request'));
  const get = (k, max) => String(b[k] ?? '').trim().slice(0, max);
  const c = {
    id: token().slice(0, 16), token: token(), created_at: new Date().toISOString(), stage: 'offered',
    studio: get('studio', 80), name: get('name', 80), email: get('email', 200).toLowerCase(), phone: get('phone', 30),
    ref: get('ref', 30), lead_id: get('lead_id', 100), kind: get('kind', 20),
    order: { apps: b.apps === true, site: b.site === true, plan: ['12', '24'].includes(String(b.plan)) ? String(b.plan) : 'once', founding: b.founding === true, care: b.care === true },
    notes: get('notes', 3000), log: [],
  };
  if (!c.studio) fail(400, 'Add the studio name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) fail(400, 'Check the email address.');
  log(c, `Agreement offered: ${payLine(quote(c.order))}`);
  await env.CLIENTS.put(`token:${c.token}`, c.id);
  await save(env, c);
  let emailed = false;
  if (b.send !== false) emailed = await sendAgreement(env, c);
  return json({ ok: true, client: await full(env, c), emailed });
}

async function sendAgreement(env, c) {
  const ok = await sendEmail(env, { to: c.email, replyTo: env.CONTACT_EMAIL, subject: `Your taal agreement for ${c.studio}`, ...agreementEmail(env, c, portalUrl(env, c)) });
  if (ok) { c.agreement_sent = new Date().toISOString(); log(c, 'Agreement emailed'); await save(env, c); }
  return ok;
}

async function act(request, env, c) {
  const b = await request.json().catch(() => fail(400, 'Bad request'));
  const what = String(b.do || '');
  const done = async (msg) => { if (msg) log(c, msg); await save(env, c); return json({ ok: true, client: await full(env, c) }); };

  if (what === 'resend') { if (!(await sendAgreement(env, c))) fail(502, 'The email did not send. Check Resend.'); return done(); }
  if (what === 'countersign') {
    if (!c.signed) fail(400, "They haven't signed yet.");
    if (c.countersigned) return done();
    c.countersigned = { name: String(b.name || env.SIGNER_NAME || 'Tim Allan').slice(0, 80), title: String(b.title || 'Founder').slice(0, 60), at: new Date().toISOString() };
    await sendEmail(env, { to: c.email, replyTo: env.CONTACT_EMAIL, subject: `Your signed agreement with taal`, ...countersignedEmail(env, c) });
    return done('Countersigned');
  }
  if (what === 'order') {
    if (c.signed) fail(400, 'They have signed: the order is fixed now. Agree any change in writing.');
    c.order = { apps: b.apps === true, site: b.site === true, plan: ['12', '24'].includes(String(b.plan)) ? String(b.plan) : 'once', founding: b.founding === true, care: b.care === true };
    return done(`Order changed: ${payLine(quote(c.order))}`);
  }
  if (what === 'note') { c.notes = String(b.notes || '').slice(0, 5000); return done(); }
  if (what === 'go_live') { c.go_live = String(b.date || '').slice(0, 10); return done(c.go_live ? `Go-live date set: ${c.go_live}` : ''); }
  if (what === 'demo') {
    if (!env.BOOKING || typeof env.BOOKING.createFromBrief !== 'function') fail(503, 'The booking app is not connected here.');
    const brief = await demoBrief(env, c);
    let made;
    try { made = await env.BOOKING.createFromBrief(brief); } catch (e) { console.error('brief demo', e); made = null; }
    if (!made || !made.ok) fail(400, (made && made.error) || 'The demo could not be built. Try again in a minute.');
    const app = (env.BOOKING_URL || '').replace(/\/$/, '');
    c.demo = { slug: made.slug, member_url: `${app}/?s=${made.slug}`, admin_url: `${app}/admin/?s=${made.slug}`, at: new Date().toISOString(), expires_at: made.expires_at };
    if (c.stage === 'signed' || c.stage === 'offered') c.stage = 'building';
    return done(`Demo built from their details: ${made.slug}`);
  }
  if (what === 'demo_link') {
    // A demo you made or changed by hand: point the review at it.
    const slug = String(b.slug || '').trim();
    if (!/^[a-z0-9-]{3,60}$/.test(slug)) fail(400, 'Paste the demo address ending, e.g. flow-yoga-k3x9p');
    const app = (env.BOOKING_URL || '').replace(/\/$/, '');
    c.demo = { slug, member_url: `${app}/?s=${slug}`, admin_url: `${app}/admin/?s=${slug}`, at: new Date().toISOString() };
    return done(`Demo set to ${slug}`);
  }
  if (what === 'review') {
    if (!c.demo) fail(400, 'Build their demo first.');
    c.review_sent = new Date().toISOString();
    c.review_round = (c.review_round || 0) + 1;
    c.approved = null;
    c.stage = 'review';
    const ok = await sendEmail(env, { to: c.email, replyTo: env.CONTACT_EMAIL, subject: c.review_round > 1 ? `Your changes are in: ${c.studio}` : `Your ${c.studio} app is ready to review`, ...reviewEmail(env, c) });
    return done(`Review link sent${ok ? '' : ' (email failed)'}`);
  }
  if (what === 'live') {
    if (c.stage === 'live') return done();
    c.stage = 'live';
    c.live_at = new Date().toISOString();
    await invoiceAtLive(env, c);
    await sendEmail(env, { to: c.email, replyTo: env.CONTACT_EMAIL, subject: `${c.studio} is live`, ...liveEmail(env, c) });
    return done('Live');
  }
  if (what === 'stage') { if (!STAGES.includes(b.stage)) fail(400, 'Unknown stage'); c.stage = b.stage; return done(`Stage set to ${STAGE_LABEL[b.stage]}`); }
  if (what === 'paid') {
    const inv = (c.invoices || []).find((i) => i.ref === b.ref);
    if (!inv) fail(404, 'No such invoice');
    inv.status = 'paid'; inv.paid_at = new Date().toISOString();
    return done(`${inv.label} marked paid`);
  }
  if (what === 'care_link') {
    const link = await careLink(env, c);
    if (!link) fail(503, 'Stripe is not connected: set up the care plan Direct Debit by hand.');
    return done('Care plan Direct Debit link made');
  }
  fail(400, 'Unknown action');
}

/** Their details as the booking app's demo maker wants them, with the pictures attached. */
async function demoBrief(env, c) {
  const b = c.brief || {};
  const pick = async (section, n) => {
    const out = [];
    for (const f of (c.files || []).filter((x) => x.section === section && /^image\/(png|jpeg|webp|svg\+xml)$/.test(x.type)).slice(0, n)) {
      const data = await env.CLIENTS.get(`file:${c.id}:${f.id}`, { type: 'arrayBuffer' });
      if (data) out.push({ type: f.type, data });
    }
    return out;
  };
  const [logo] = await pick('logo', 1);
  const photos = await pick('photos', 6);
  return {
    name: c.studio, kind: c.kind || 'fitness',
    brand_color: b.brand?.colour || '#135855', accent_color: b.brand?.accent || '#D8BF8C',
    font: b.brand?.font || 'modern', heading_font: b.brand?.heading_font || '', body_font: b.brand?.body_font || '',
    first_name: (c.name || '').split(/\s+/)[0],
    tagline: b.studio?.tagline || '', about: b.studio?.about || '', address: b.studio?.address || '',
    classes: b.classes || [], timetable: b.timetable || [], treatments: b.treatments || [],
    memberships: b.memberships || [], packs: b.packs || [], team: b.team || [],
    logo: logo || null, hero: photos[0] || null, photos: photos.slice(1),
    days: 90,
  };
}

async function leadUpdate(request, env, id) {
  const b = await request.json().catch(() => fail(400, 'Bad request'));
  const key = `lead:${id}`;
  const got = await env.ENQUIRIES.getWithMetadata(key);
  if (!got || got.value == null) fail(404, 'No such lead');
  const meta = { ...(got.metadata || {}) };
  if ('summary_note' in b) meta.summary_note = String(b.summary_note || '').slice(0, 900);
  if ('summary_hold' in b) meta.summary_hold = b.summary_hold === true;
  if ('closed' in b) meta.closed = b.closed === true;
  const left = Math.max(60, Math.round((Date.parse(meta.created_at || new Date().toISOString()) + 365 * DAY - Date.now()) / 1000));
  await env.ENQUIRIES.put(key, got.value, { expirationTtl: left, metadata: meta });
  return json({ ok: true, lead: { id, ...meta } });
}

/* ---------- Invoices and Direct Debits (Stripe) ---------- */

async function invoiceAtSigning(env, c) {
  const q = quote(c.order);
  const label = q.months ? `Start payment (${q.months} month plan)` : 'Setup, first half (on signing)';
  await addInvoice(env, c, { ref: 'first', label, amount: q.first, description: `taal setup for ${c.studio}: ${label.toLowerCase()}` });
}

async function invoiceAtLive(env, c) {
  const q = quote(c.order);
  if (q.months) await planLink(env, c, q);
  else await addInvoice(env, c, { ref: 'last', label: 'Setup, second half (at go-live)', amount: q.last, description: `taal setup for ${c.studio}: second half, at go-live` });
  if (c.order.care) await careLink(env, c);
}

async function addInvoice(env, c, { ref, label, amount, description }) {
  if ((c.invoices || []).some((i) => i.ref === ref)) return;
  const inv = { ref, kind: 'invoice', label, amount, status: 'manual', at: new Date().toISOString() };
  c.invoices = [...(c.invoices || []), inv];
  if (!env.STRIPE_SECRET_KEY || amount <= 0) return;
  try {
    const customer = await stripeCustomer(env, c);
    await stripe(env, 'invoiceitems', { customer, amount: Math.round(amount * 100), currency: 'gbp', description });
    const made = await stripe(env, 'invoices', {
      customer, collection_method: 'send_invoice', days_until_due: 14, pending_invoice_items_behavior: 'include',
      description: `Thank you for choosing taal. Prices include any VAT that applies.`,
      'metadata[client_id]': c.id, 'metadata[ref]': ref,
    });
    const fin = await stripe(env, `invoices/${made.id}/finalize`, {});
    await stripe(env, `invoices/${made.id}/send`, {});
    Object.assign(inv, { status: 'open', stripe_id: made.id, url: fin.hosted_invoice_url || '', number: fin.number || '' });
  } catch (e) {
    console.error('stripe invoice', e);
    inv.error = String(e.message || e).slice(0, 200);
  }
}

/** The monthly plan: a Direct Debit (or card) that collects the agreed number of payments and stops. */
async function planLink(env, c, q) {
  if ((c.invoices || []).some((i) => i.ref === 'plan')) return;
  const inv = { ref: 'plan', kind: 'monthly', label: `${gbp(q.monthly)} a month for ${q.months} months`, amount: q.monthly, months: q.months, status: 'manual', at: new Date().toISOString() };
  c.invoices = [...(c.invoices || []), inv];
  const link = await checkout(env, c, { amount: q.monthly, name: `taal setup for ${c.studio}, ${q.months} monthly payments`, ref: 'plan', months: q.months });
  if (link) Object.assign(inv, { status: 'to_set_up', url: link });
}

async function careLink(env, c) {
  const existing = (c.invoices || []).find((i) => i.ref === 'care');
  if (existing?.url) return existing.url;
  const q = quote(c.order);
  const inv = existing || { ref: 'care', kind: 'monthly', label: `Care plan, ${gbp(q.care)} a month from your second year`, amount: q.care, status: 'manual', at: new Date().toISOString() };
  if (!existing) c.invoices = [...(c.invoices || []), inv];
  // The first payment is a year after go-live: Stripe's limit on a delayed start is about two years.
  const start = new Date(c.live_at || Date.now());
  start.setUTCFullYear(start.getUTCFullYear() + 1);
  const link = await checkout(env, c, { amount: q.care, name: `taal care plan for ${c.studio}`, ref: 'care', startsAt: Math.floor(start.getTime() / 1000) });
  if (link) Object.assign(inv, { status: 'to_set_up', url: link });
  return link;
}

async function checkout(env, c, { amount, name, ref, months, startsAt }) {
  if (!env.STRIPE_SECRET_KEY) return '';
  try {
    const customer = await stripeCustomer(env, c);
    const back = portalUrl(env, c);
    const params = {
      mode: 'subscription', customer,
      'line_items[0][quantity]': 1,
      'line_items[0][price_data][currency]': 'gbp',
      'line_items[0][price_data][unit_amount]': Math.round(amount * 100),
      'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][price_data][product_data][name]': name,
      'payment_method_types[0]': 'bacs_debit', 'payment_method_types[1]': 'card',
      success_url: `${back}?paid=1#payments`, cancel_url: `${back}#payments`,
      'metadata[client_id]': c.id, 'metadata[ref]': ref,
      'subscription_data[metadata][client_id]': c.id, 'subscription_data[metadata][ref]': ref,
    };
    if (months) params['subscription_data[metadata][months]'] = months;
    if (startsAt) params['subscription_data[trial_end]'] = startsAt;
    const s = await stripe(env, 'checkout/sessions', params);
    return s.url || '';
  } catch (e) {
    console.error('stripe checkout', e);
    return '';
  }
}

async function stripeCustomer(env, c) {
  if (c.stripe_customer) return c.stripe_customer;
  const made = await stripe(env, 'customers', {
    email: c.email, name: c.party?.legal_name || c.studio,
    'address[line1]': (c.party?.address || '').slice(0, 200), 'address[country]': 'GB',
    'metadata[client_id]': c.id, 'metadata[studio]': c.studio,
  });
  c.stripe_customer = made.id;
  return made.id;
}

export async function stripe(env, path, params, method = 'POST') {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') body.append(k, String(v));
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : body,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error?.message || `Stripe ${res.status}`);
  return out;
}

async function stripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) fail(503, 'Stripe is not connected.');
  const raw = await request.text();
  if (!(await stripeSigned(env.STRIPE_WEBHOOK_SECRET, raw, request.headers.get('stripe-signature') || ''))) fail(401, 'Bad signature');
  let ev; try { ev = JSON.parse(raw); } catch { fail(400, 'Bad JSON'); }
  const o = ev.data?.object || {};
  const meta = o.metadata?.client_id ? o.metadata : (o.subscription_details?.metadata || o.parent?.subscription_details?.metadata || {});
  const id = meta.client_id;
  if (!id) return json({ ok: true });
  const c = await load(env, id);
  if (!c) return json({ ok: true });
  const ref = meta.ref;
  const inv = (c.invoices || []).find((i) => i.ref === ref);

  if (ev.type === 'checkout.session.completed' && o.subscription) {
    if (inv) Object.assign(inv, { status: 'active', subscription: o.subscription });
    // A plan stops itself after the agreed number of payments: the first now, the last a few days before cancel_at.
    const months = Number(meta.months) || Number(inv?.months) || 0;
    if (months) {
      const end = new Date(); end.setUTCMonth(end.getUTCMonth() + months); end.setUTCDate(end.getUTCDate() - 3);
      await stripe(env, `subscriptions/${o.subscription}`, { cancel_at: Math.floor(end.getTime() / 1000) }).catch((e) => console.error('cancel_at', e));
    }
    log(c, `${inv?.label || 'Direct Debit'} set up`);
    await save(env, c);
    await notify(env, `Direct Debit set up: ${c.studio}`, [['Studio', c.studio], ['For', inv?.label || ref]]);
  } else if (ev.type === 'invoice.paid') {
    if (inv && inv.kind === 'invoice') Object.assign(inv, { status: 'paid', paid_at: new Date().toISOString() });
    else if (inv) inv.payments = (inv.payments || 0) + 1;
    log(c, `Paid: ${gbp((o.amount_paid || 0) / 100)} (${inv?.label || ref || 'payment'})`);
    await save(env, c);
    if ((o.amount_paid || 0) > 0) await notify(env, `Paid: ${c.studio}, ${gbp(o.amount_paid / 100)}`, [['Studio', c.studio], ['For', inv?.label || ref], ['Partner', c.ref]]);
  } else if (ev.type === 'invoice.payment_failed') {
    log(c, `Payment failed (${inv?.label || ref})`);
    await save(env, c);
    await notify(env, `Payment failed: ${c.studio}`, [['Studio', c.studio], ['For', inv?.label || ref], ['Amount', gbp((o.amount_due || 0) / 100)]]);
  }
  return json({ ok: true });
}

/** Stripe's signature: t=<time>,v1=<hmac of "time.body">, within five minutes. */
export async function stripeSigned(secret, raw, header, now = Date.now()) {
  const parts = Object.fromEntries(header.split(',').map((x) => x.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > 300) return false;
  const want = await hmacHex(secret, `${t}.${raw}`);
  return header.split(',').some((x) => { const [k, v] = x.split('='); return k.trim() === 'v1' && timingSafe(v.trim(), want); });
}

/* ---------- Daily jobs ---------- */

/**
 * Run hourly by the cron. Call summaries go out about an hour after a booked call; follow-ups five and
 * twelve days later unless they've been offered an agreement. Upload and review reminders go once a day.
 */
export async function clientJobs(env, now = Date.now()) {
  let sent = 0;
  sent += await callSummaries(env, now);
  if (new Date(now).getUTCHours() === 9) sent += await reminders(env, now);
  return sent;
}

async function callSummaries(env, now) {
  if (!env.ENQUIRIES) return 0;
  const leads = await listAll(env.ENQUIRIES, 'lead:');
  const offered = new Set((await listClients(env)).map((c) => (c.email || '').toLowerCase()));
  let n = 0;
  for (const k of leads) {
    const m = k.metadata || {};
    if (m.type !== 'call' || !m.booked || m.cancelled || m.closed || !m.email || !m.call_at) continue;
    const since = now - Date.parse(m.call_at);
    if (offered.has(m.email.toLowerCase())) continue;
    const first = (m.name || '').split(' ')[0] || 'there';
    const ctx = { first, studio: m.studio, note: m.summary_note || '', call_url: env.CALL_URL || '', deck: deckUrl(env), demo: env.PUBLIC_URL ? `${origin(env)}/demo` : '' };
    let send = null;
    if (!m.summary_at && !m.summary_hold && since >= 60 * 60 * 1000 && since < 3 * DAY) send = ['summary_at', `Following up on our call: ${m.studio}`, summaryEmail(env, ctx)];
    else if (m.summary_at && !m.follow1_at && now - Date.parse(m.summary_at) >= 5 * DAY && now - Date.parse(m.summary_at) < 11 * DAY) send = ['follow1_at', `Any questions about taal for ${m.studio}?`, followEmail(env, ctx, 1)];
    else if (m.follow1_at && !m.follow2_at && now - Date.parse(m.summary_at) >= 12 * DAY && now - Date.parse(m.summary_at) < 20 * DAY) send = ['follow2_at', `Last note from me: ${m.studio}`, followEmail(env, ctx, 2)];
    if (!send) continue;
    const ok = await sendEmail(env, { to: m.email, replyTo: env.CONTACT_EMAIL, subject: send[1], ...send[2] });
    if (!ok) continue;
    const got = await env.ENQUIRIES.getWithMetadata(k.name);
    if (got?.value != null) {
      const left = Math.max(60, Math.round((Date.parse(m.created_at || new Date(now).toISOString()) + 365 * DAY - now) / 1000));
      await env.ENQUIRIES.put(k.name, got.value, { expirationTtl: left, metadata: { ...(got.metadata || {}), [send[0]]: new Date(now).toISOString() } });
    }
    n++;
  }
  return n;
}

async function reminders(env, now) {
  let n = 0;
  for (const s of await listClients(env)) {
    const c = await load(env, s.id);
    if (!c) continue;
    const link = portalUrl(env, c);
    let send = null;
    // Details: three days after signing, then a week, if nothing's been sent over.
    if ((c.stage === 'signed' || c.stage === 'building') && c.signed && !c.brief_submitted && !c.demo) {
      const age = now - Date.parse(c.signed.at);
      if (age >= 3 * DAY && !c.remind1) send = ['remind1', `A reminder: what we need to build ${c.studio}`, uploadReminderEmail(env, c, link)];
      else if (age >= 8 * DAY && !c.remind2) send = ['remind2', `Still need a hand with your ${c.studio} details?`, uploadReminderEmail(env, c, link, true)];
    }
    // Review: five days after it was sent, if not approved or answered.
    if (c.stage === 'review' && c.review_sent && !c.approved && !c[`review_nudge_${c.review_round}`]) {
      const lastAsk = (c.requests || []).filter((r) => r.at > c.review_sent).length;
      if (!lastAsk && now - Date.parse(c.review_sent) >= 5 * DAY) send = [`review_nudge_${c.review_round}`, `Have you had a look at ${c.studio}?`, reviewEmail(env, c, true)];
    }
    if (!send) continue;
    if (await sendEmail(env, { to: c.email, replyTo: env.CONTACT_EMAIL, subject: send[1], ...send[2] })) {
      c[send[0]] = new Date(now).toISOString();
      await save(env, c);
      n++;
    }
  }
  return n;
}

/* ---------- Emails to studios ---------- */

const deckUrl = (env) => env.DECK_URL || `${origin(env)}/taal-overview.pdf`;
const portalUrl = (env, c) => `${origin(env)}/client/${c.token}`;
const firstName = (c) => (c.name || '').split(' ')[0] || 'there';

export function summaryEmail(env, { first, studio, note, call_url, deck }) {
  const html = frame(env, `${p(`Hi ${esc(first)},`)}
${p(`Thanks for your time today. Here's a short recap of taal for ${esc(studio)}, and the overview to keep or share with your team.`)}
${note ? `<div style="background:#F2F3EE;border-radius:14px;padding:16px 18px;margin:0 0 20px;white-space:pre-wrap;font-size:15px">${esc(note)}</div>` : ''}
${steps([
    ['Your own app, in your brand', 'Booking, memberships, payments and the back office, on your own web address and, if you like, the App Store and Google Play.'],
    ['You own it', 'Pay once, or spread it over 12 or 24 months. No monthly fee to us; your running costs go to the providers in your own name, about £1 a day.'],
    ['We do the setup', 'You send us your logo, photos, timetable and prices through a simple upload page. We build it, you review it, then we move your members across.'],
  ])}
<p style="margin:0 0 24px">${button(deck, 'Download the overview (PDF)')}</p>
${p(`When you're ready, reply to this email and I'll send your agreement to sign online. ${call_url ? `If you'd like another look together first, <a href="${esc(call_url)}" style="color:#0F5C57;font-weight:600">book a time</a>.` : ''}`)}
${sign}`, `A recap of taal for ${studio}`);
  const text = `Hi ${first},

Thanks for your time today. Here's a short recap of taal for ${studio}, and the overview to keep or share with your team.
${note ? `\n${note}\n` : ''}
1. Your own app, in your brand: booking, memberships, payments and the back office, on your own web address and, if you like, the App Store and Google Play.
2. You own it: pay once, or spread it over 12 or 24 months. No monthly fee to us; running costs go to the providers in your own name, about £1 a day.
3. We do the setup: you send us your logo, photos, timetable and prices through a simple upload page. We build it, you review it, then we move your members across.

The overview (PDF): ${deck}

When you're ready, reply to this email and I'll send your agreement to sign online.${call_url ? ` If you'd like another look together first, book a time: ${call_url}` : ''}

Tim
Founder, taal`;
  return { html, text };
}

function followEmail(env, { first, studio, call_url, deck }, n) {
  const body = n === 1
    ? `Just checking in after our call about ${studio}. Is there anything I can answer, or anyone on your team who'd like to see it? Reply here and I'll come back to you the same day.`
    : `I won't keep emailing, so this is my last note. If the timing isn't right, no problem at all: the overview stays at the link below, and you can reply whenever you're ready and I'll pick it up from there.`;
  const html = frame(env, `${p(`Hi ${esc(first)},`)}${p(esc(body))}
<p style="margin:0 0 22px">${button(deck, 'The overview (PDF)', n === 2)}</p>
${call_url && n === 1 ? p(`Or <a href="${esc(call_url)}" style="color:#0F5C57;font-weight:600">book another short call</a>.`) : ''}${sign}`, n === 1 ? 'Any questions?' : 'My last note');
  return { html, text: `Hi ${first},\n\n${body}\n\nThe overview: ${deck}${call_url && n === 1 ? `\nBook another short call: ${call_url}` : ''}\n\nTim\nFounder, taal` };
}

function agreementEmail(env, c, link) {
  const q = quote(c.order);
  const html = frame(env, `${p(`Hi ${esc(firstName(c))},`)}
${p(`Here's your agreement for ${esc(c.studio)}. Read it, add your studio's details and sign online in a couple of minutes. You'll get a copy by email.`)}
${rows([['What you chose', q.lines.map((l) => l.label).join(', ')], ['How you pay', payLine(q)], ['Founding offer', q.founding ? '30% off setup' : '']])}
<p style="margin:0 0 24px">${button(link, 'Read and sign')}</p>
${small(`After you sign, the same page is where you upload your logo, photos, timetable and prices, see your invoices and review your app. Keep this email: the link is private to you.`)}
${sign}`, `Your agreement for ${c.studio}, ready to sign`);
  return { html, text: `Hi ${firstName(c)},\n\nHere's your agreement for ${c.studio}. Read it, add your studio's details and sign online in a couple of minutes.\n\nWhat you chose: ${q.lines.map((l) => l.label).join(', ')}\nHow you pay: ${payLine(q)}\n\nRead and sign: ${link}\n\nAfter you sign, the same page is where you upload your details, see your invoices and review your app. Keep this email: the link is private to you.\n\nTim\nFounder, taal` };
}

function welcomeEmail(env, c, link) {
  const inv = (c.invoices || [])[0];
  const pay = inv ? (inv.url ? `Your first invoice (${gbp(inv.amount)}) is on its way from Stripe, and in your portal.` : `Your first invoice (${gbp(inv.amount)}) will follow shortly.`) : '';
  const html = frame(env, `${heading(`Welcome, ${c.studio}`)}
${p(`Hi ${esc(firstName(c))}, thank you for signing. Here's what happens next. It all lives on one page, your portal.`)}
${steps([
    ['Send us your details', 'Logo, photos, colours, classes, timetable, treatments, prices and team. It saves as you go, so do it in a few sittings if you like.'],
    ['Set up your accounts', `${c.order.apps ? 'Start with Apple and Google: they take a couple of weeks to approve. ' : ''}Each has a step by step guide, and they're in your name, so you own everything.`],
    ['Review your app', "We build it from what you send and email you a link to try it. Ask for changes or approve it."],
    ['Go live', 'We connect payments and email, move your members across and train your team.'],
  ])}
<p style="margin:0 0 22px">${button(link, 'Open your portal')}</p>
${pay ? small(esc(pay)) : ''}${small(`Your signed agreement is in the portal under Agreement. Once I've countersigned, you'll get the final copy too.`)}
${sign}`, 'What happens next');
  return { html, text: `Hi ${firstName(c)}, thank you for signing. Here's what happens next. It all lives on one page, your portal: ${link}\n\n1. Send us your details: logo, photos, colours, classes, timetable, treatments, prices and team. It saves as you go.\n2. Set up your accounts: each has a step by step guide${c.order.apps ? '. Start with Apple and Google, which take a couple of weeks.' : '.'}\n3. Review your app: we build it from what you send and email you a link to try it.\n4. Go live: we connect payments and email, move your members across and train your team.\n\n${pay}\n\nTim\nFounder, taal` };
}

function countersignedEmail(env, c) {
  const link = `${origin(env)}/agreement/${c.token}`;
  const html = frame(env, `${p(`Hi ${esc(firstName(c))},`)}
${p(`I've countersigned your agreement, so it's now signed by us both. Here's your copy to keep: open it and choose "Save as PDF".`)}
<p style="margin:0 0 22px">${button(link, 'Your signed agreement')}</p>
${p(`Next step: your details, in your <a href="${esc(portalUrl(env, c))}" style="color:#0F5C57;font-weight:600">portal</a>.`)}${sign}`, 'Signed by us both');
  return { html, text: `Hi ${firstName(c)},\n\nI've countersigned your agreement, so it's now signed by us both. Your copy: ${link}\n\nNext step: your details, in your portal: ${portalUrl(env, c)}\n\nTim\nFounder, taal` };
}

function uploadReminderEmail(env, c, link, second = false) {
  const gaps = missing(c);
  const html = frame(env, `${p(`Hi ${esc(firstName(c))},`)}
${p(second ? `Just checking whether you need a hand with your details for ${esc(c.studio)}. If something's hard to pull together, send what you have and reply with the rest: we can work from rough notes.` : `To start building ${esc(c.studio)}, we need a few things from you. Everything you add saves as you go.`)}
${gaps.length ? `${p('<b>Still to add</b>', 'margin-bottom:6px')}<ul style="margin:0 0 20px;padding-left:20px;color:#33403D">${gaps.map((g) => `<li style="margin:4px 0">${esc(g)}</li>`).join('')}</ul>` : ''}
<p style="margin:0 0 22px">${button(link, 'Add your details')}</p>${sign}`, 'What we still need');
  return { html, text: `Hi ${firstName(c)},\n\n${second ? `Just checking whether you need a hand with your details for ${c.studio}. Send what you have and reply with the rest.` : `To start building ${c.studio}, we need a few things from you.`}\n\n${gaps.length ? `Still to add:\n${gaps.map((g) => `- ${g}`).join('\n')}\n\n` : ''}Add your details: ${link}\n\nTim\nFounder, taal` };
}

function reviewEmail(env, c, nudge = false) {
  const link = `${portalUrl(env, c)}#review`;
  const again = (c.review_round || 1) > 1;
  const html = frame(env, `${heading(nudge ? 'Ready when you are' : again ? 'Your changes are in' : 'Your app is ready to review')}
${p(`Hi ${esc(firstName(c))}, ${nudge ? `your ${esc(c.studio)} app is waiting for your review.` : again ? `we've made the changes you asked for in ${esc(c.studio)}.` : `here's ${esc(c.studio)}, built from what you sent us: your timetable, prices, team and brand.`}`)}
${p('Try it as a member, then as staff and as the owner with the bar at the top. Then, in your portal, either approve it or tell us what to change.')}
<p style="margin:0 0 14px">${button(link, 'Review your app')}</p>
${c.demo ? small(`Or open it straight away: <a href="${esc(c.demo.member_url)}" style="color:#0F5C57">your app</a> and <a href="${esc(c.demo.admin_url)}" style="color:#0F5C57">the back office</a>.`) : ''}
${small('Your first round of changes is included. Approving it is what starts go-live: payments, email and moving your members across.')}${sign}`, 'Try it, then approve or ask for changes');
  return { html, text: `Hi ${firstName(c)},\n\n${again ? `We've made the changes you asked for in ${c.studio}.` : `Here's ${c.studio}, built from what you sent us.`} Try it as a member, then as staff and as the owner. Then approve it or tell us what to change in your portal: ${link}\n\n${c.demo ? `Your app: ${c.demo.member_url}\nThe back office: ${c.demo.admin_url}\n\n` : ''}Tim\nFounder, taal` };
}

function approvedEmail(env, c) {
  const left = accountsFor(c).filter((a) => !c.accounts?.[a]).map((a) => ACCOUNT_NAMES[a]);
  const html = frame(env, `${heading('Approved: thank you')}
${p(`Hi ${esc(firstName(c))}, ${esc(c.studio)} is approved. Next we connect your payments and email, set your go-live date and move your members across.`)}
${left.length ? p(`<b>To finish first:</b> ${esc(left.join(', '))}. The step by step guides are in your portal under Accounts.`) : p("All your accounts are ready, so we'll be in touch to agree your go-live date.")}
<p style="margin:0 0 22px">${button(portalUrl(env, c) + '#accounts', 'Open your portal')}</p>${sign}`, 'Next: go-live');
  return { html, text: `Hi ${firstName(c)}, ${c.studio} is approved. Next we connect your payments and email, set your go-live date and move your members across.\n\n${left.length ? `To finish first: ${left.join(', ')}. The guides are in your portal.` : "All your accounts are ready, so we'll be in touch to agree your go-live date."}\n\n${portalUrl(env, c)}\n\nTim\nFounder, taal` };
}

function liveEmail(env, c) {
  const q = quote(c.order);
  const plan = (c.invoices || []).find((i) => i.ref === 'plan');
  const last = (c.invoices || []).find((i) => i.ref === 'last');
  const care = (c.invoices || []).find((i) => i.ref === 'care');
  const money = [
    last ? `The second half of your setup fee (${gbp(last.amount)}) is ${last.url ? 'on its way from Stripe' : 'on its way'}.` : '',
    plan ? `Your monthly payments (${gbp(q.monthly)} for ${q.months} months) start now: ${plan.url ? 'set up your Direct Debit from your portal.' : "we'll send the Direct Debit link."}` : '',
    care ? `Your care plan (${gbp(q.care)} a month) starts in a year: ${care.url ? 'you can set up its Direct Debit now from your portal, and nothing is taken until then.' : "we'll send the Direct Debit link before it starts."}` : '',
  ].filter(Boolean);
  const html = frame(env, `${heading(`${c.studio} is live`)}
${p(`Hi ${esc(firstName(c))}, congratulations: your members can now book, pay and check in with your own app. Your 12 months of updates and support start today.`)}
${money.length ? `<ul style="margin:0 0 20px;padding-left:20px;color:#33403D">${money.map((m) => `<li style="margin:6px 0">${esc(m)}</li>`).join('')}</ul>` : ''}
${p('Anything not working as it should, or a small change you need: just reply to this email.')}
<p style="margin:0 0 8px">${button(portalUrl(env, c) + '#payments', 'Your portal')}</p>${sign}`, 'Your members can book now');
  return { html, text: `Hi ${firstName(c)}, congratulations: ${c.studio} is live. Your 12 months of updates and support start today.\n\n${money.join('\n')}\n\nAnything not working, or a small change you need: just reply.\n\n${portalUrl(env, c)}\n\nTim\nFounder, taal` };
}

/* ---------- Storage ---------- */

async function load(env, id) {
  const raw = await env.CLIENTS.get(`client:${id}`);
  return raw ? JSON.parse(raw) : null;
}

async function byToken(env, t) {
  if (!env.CLIENTS || !/^[a-f0-9]{32}$/.test(t)) return null;
  const id = await env.CLIENTS.get(`token:${t}`);
  return id ? load(env, id) : null;
}

async function save(env, c) {
  c.updated_at = new Date().toISOString();
  await env.CLIENTS.put(`client:${c.id}`, JSON.stringify(c), {
    metadata: { id: c.id, studio: c.studio, name: c.name, email: c.email, stage: c.stage, ref: c.ref, created_at: c.created_at, updated_at: c.updated_at, countersigned: !!c.countersigned, waiting: waitingOn(c) },
  });
}

/** One line for the list: who the next step is waiting on. */
function waitingOn(c) {
  if (c.stage === 'offered') return 'Them: to sign';
  if (c.signed && !c.countersigned) return 'You: to countersign';
  if ((c.stage === 'signed' || c.stage === 'building') && !c.brief_submitted && !c.demo) return 'Them: their details';
  if (c.stage === 'building') return 'You: build the demo';
  if (c.stage === 'review') return (c.requests || []).some((r) => r.at > c.review_sent) ? 'You: their changes' : 'Them: to review';
  if (c.stage === 'approved') return 'You: go-live';
  return '';
}

async function listClients(env) {
  if (!env.CLIENTS) return [];
  const keys = await listAll(env.CLIENTS, 'client:');
  return keys.map((k) => ({ id: k.name.slice(7), ...(k.metadata || {}) })).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

async function listAll(ns, prefix) {
  const out = [];
  let cursor;
  do {
    const page = await ns.list({ prefix, cursor });
    out.push(...page.keys);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && out.length < 5000);
  return out;
}

/** Everything about one studio, for you. */
async function full(env, c) {
  return { ...c, portal_url: portalUrl(env, c), agreement_url: `${origin(env)}/agreement/${c.token}`, quote: quote(c.order), pay_line: payLine(quote(c.order)), missing: missing(c), needs: accountsFor(c), waiting: waitingOn(c) };
}

function log(c, what) {
  c.log = [...(c.log || []), { at: new Date().toISOString(), what }].slice(-200);
}

/** The signature lines in a signed copy, brought up to date with the countersignature. */
function withSignatures(copy, c, env) {
  if (!c.countersigned) return copy;
  return copy.replace(/<div class="sig sig-empty"><p>Signed for taal: waiting<\/p><\/div>/,
    `<div class="sig"><p class="sig-name">${esc(c.countersigned.name)}</p><p>${esc(c.countersigned.title ? `${c.countersigned.title}, ` : '')}signed for taal on ${esc(new Date(c.countersigned.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }))}</p></div>`);
}

function audit(c) {
  if (!c.signed) return '';
  const when = (iso) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/London' });
  return `<div class="audit"><b>Signing record.</b> Signed electronically by ${esc(c.signed.name)} (${esc(c.signed.email)}) by typing their name and ticking to agree, on ${esc(when(c.signed.at))} UK time, from IP address ${esc(c.signed.ip || 'not recorded')}. Agreement version ${esc(c.signed.version)}; fingerprint of the signed text (SHA-256) ${esc(c.signed.sha256 || '')}.${c.countersigned ? ` Countersigned for taal by ${esc(c.countersigned.name)} on ${esc(when(c.countersigned.at))}.` : ''}</div>`;
}

/* ---------- Helpers ---------- */

class Reply { constructor(res) { this.res = res; } }
function fail(status, error) { throw new Reply(json({ error }, status)); }
function json(b, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
function admin(request, env) {
  const auth = request.headers.get('authorization') || '';
  return env.ADMIN_KEY && env.ADMIN_KEY.length >= 16 && timingSafe(auth, `Bearer ${env.ADMIN_KEY}`);
}
const origin = (env) => (env.PUBLIC_URL || 'https://taal.solutions').replace(/\/$/, '');
function token() { return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join(''); }
async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function hmacHex(secret, data) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function timingSafe(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
