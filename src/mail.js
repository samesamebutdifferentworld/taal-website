/**
 * Every email taal sends to studios, in one look: paper background, the taal mark, a white card,
 * green buttons and a quiet footer. Sent through Resend (RESEND_API_KEY, EMAIL_FROM); without a key
 * nothing is sent and the call returns false.
 *
 * Emails to a studio's own members are not sent from here: they go from the studio's own Resend
 * account, in the studio's brand.
 */

export const C = { paper: '#F2F3EE', ink: '#13201E', mute: '#55625F', green: '#0F5C57', seal: '#A8382B', rule: '#D3DAD3', tint: '#E3E9E3' };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** The shared frame. `site` is the public address, for the logo; `preheader` is the line inboxes show. */
export function layout(inner, { site = 'https://taal.solutions', preheader = '', company = '' } = {}) {
  const logo = `${site.replace(/\/$/, '')}/img/email-logo.png`;
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>taal</title></head>
<body style="margin:0;background:${C.paper};font-family:${FONT};color:${C.ink};-webkit-text-size-adjust:100%">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:28px 14px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">
<tr><td style="padding:0 6px 16px"><img src="${esc(logo)}" width="84" height="28" alt="taal" style="display:block;border:0;width:84px;height:28px"></td></tr>
<tr><td style="background:#ffffff;border-radius:22px;padding:36px 32px 32px;font-size:16px;line-height:1.6;border-top:4px solid ${C.green}">
${inner}
</td></tr>
<tr><td style="padding:20px 6px 0;font-size:12px;line-height:1.6;color:${C.mute}">
taal: your own booking app, in your brand, that you own.<br>
Studio software made in London. <a href="${esc(site)}" style="color:${C.mute}">taal.solutions</a>${company ? `<br>${esc(company)}` : ''}
</td></tr>
</table></td></tr></table></body></html>`;
}

export const button = (href, label, solid = true) =>
  `<a href="${esc(href)}" style="display:inline-block;padding:13px 24px;border-radius:999px;text-decoration:none;font-weight:600;font-size:16px;${solid ? `background:${C.green};color:#ffffff` : `color:${C.green};border:1.5px solid ${C.green}`}">${esc(label)}</a>`;

export const p = (html, extra = '') => `<p style="margin:0 0 16px;${extra}">${html}</p>`;
export const small = (html) => `<p style="margin:0 0 12px;color:${C.mute};font-size:14px">${html}</p>`;
export const heading = (text) => `<p style="margin:0 0 18px;font-size:24px;line-height:1.2;font-weight:700;letter-spacing:-0.01em">${esc(text)}</p>`;
export const sign = `<p style="margin:24px 0 0">Tim<br><span style="color:${C.mute}">Founder, taal</span></p>`;

/** A short list of steps, each with a tick or a number. */
export function steps(items) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px">${items.map(([title, text], i) =>
    `<tr><td valign="top" style="width:30px;padding:8px 0"><span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:${C.tint};color:${C.green};font-size:12px;font-weight:700;text-align:center;line-height:22px">${i + 1}</span></td>
<td style="padding:8px 0;font-size:15px;line-height:1.5"><b>${esc(title)}</b>${text ? `<br><span style="color:${C.mute}">${esc(text)}</span>` : ''}</td></tr>`).join('')}</table>`;
}

/** Label and value rows, for summaries and notes to you. */
export function rows(list) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-top:1px solid ${C.rule}">${list.filter(([, v]) => v !== '' && v != null).map(([k, v]) =>
    `<tr><td valign="top" style="padding:9px 12px 9px 0;border-bottom:1px solid ${C.rule};color:${C.mute};font-size:14px;width:38%">${esc(k)}</td><td style="padding:9px 0;border-bottom:1px solid ${C.rule};font-size:15px">${esc(v)}</td></tr>`).join('')}</table>`;
}

export function frame(env, inner, preheader = '') {
  return layout(inner, { site: env.PUBLIC_URL || 'https://taal.solutions', preheader, company: env.COMPANY_LINE || '' });
}

export async function sendEmail(env, { to, subject, html, text, replyTo, attachments }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.log(`[email not sent: no key] to=${to} subject="${subject}"`);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.EMAIL_FROM, to: [to], subject, html, text,
        reply_to: replyTo && replyTo.includes('@') ? replyTo : undefined,
        attachments: attachments && attachments.length ? attachments : undefined,
      }),
    });
    if (!res.ok) console.error('resend', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('resend', err);
    return false;
  }
}

/** A note to you (CONTACT_EMAIL), as label and value rows, with an optional button. */
export async function notify(env, subject, list, link) {
  if (!env.CONTACT_EMAIL || !env.CONTACT_EMAIL.includes('@')) return false;
  const shown = list.filter(([, v]) => v !== '' && v != null);
  return sendEmail(env, {
    to: env.CONTACT_EMAIL,
    subject,
    html: frame(env, heading(subject) + rows(shown) + (link ? `<p style="margin:0">${button(link[0], link[1])}</p>` : '')),
    text: shown.map(([k, v]) => `${k}: ${v}`).join('\n') + (link ? `\n\n${link[1]}: ${link[0]}` : ''),
  });
}
