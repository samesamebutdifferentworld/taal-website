/**
 * The service agreement and data processing agreement a studio signs, filled in from its order.
 * Same words as "taal: client paperwork and onboarding", sections 1 and 2. When the lawyer's read
 * changes the wording, change it here and raise VERSION: studios who already signed keep the exact
 * copy they signed (saved with their record), and new studios get the new one.
 */
import { esc } from './mail.js';
import { ITEMS, quote, gbp, payLine, CARE } from './prices.js';

export const VERSION = 'November 2026';

const longDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });

/**
 * client: the record from src/clients.js. party: the studio's details as typed when signing
 * ({ legal_name, address, locations, care }), or the ones saved at signing.
 */
export function agreementHtml(client, env, party = client.party || {}) {
  const us = env.COMPANY_NAME || 'Tim Allan, trading as taal';
  const dayRate = env.DAY_RATE || '£400';
  const q = quote(client.order);
  const name = party.legal_name || client.studio;
  const where = party.address || 'the address given when signing';
  const start = client.signed ? longDate(client.signed.at) : 'the date you sign';
  const care = party.care ?? client.order.care;
  const yes = (b) => (b ? 'Yes' : 'No');
  const lines = q.lines.map((l) => `<tr><td>${esc(l.label)}</td><td>Yes</td><td>${q.months ? `${gbp(l.start)} then ${gbp(l.monthly)} a month` : gbp(l.once)}</td></tr>`).join('');
  const notChosen = ['apps', 'site'].filter((k) => !q.keys.includes(k)).map((k) => `<tr><td>${esc(ITEMS[k].label)}</td><td>No</td><td></td></tr>`).join('');
  const sig = (who, s) => s
    ? `<div class="sig"><p class="sig-name">${esc(s.name)}</p><p>${esc(s.title ? `${s.title}, ` : '')}signed for ${esc(who)} on ${esc(longDate(s.at))}</p></div>`
    : `<div class="sig sig-empty"><p>Signed for ${esc(who)}: waiting</p></div>`;

  return `<article class="agreement">
<h2>1. Service agreement</h2>
<p>This agreement is between ${esc(us)} ("taal", "we") and ${esc(name)} of ${esc(where)} ("you"). It starts on ${esc(start)}.</p>

<h3>What you are buying</h3>
<table><thead><tr><th>Item</th><th>Price</th><th>What it includes</th></tr></thead><tbody>
<tr><td>Booking system</td><td>£1,900 one-off, for up to 2,000 active clients (larger studios by quote)</td><td>Members' app on phone and computer, back office, setup of your timetable, prices and team, members moved from your current system, payments connected, staff training, and 12 months of updates and support</td></tr>
<tr><td>Branded apps</td><td>£1,000 one-off</td><td>Your app on the App Store and Google Play, submitted under your own developer accounts, which we set up in your name and on your own billing</td></tr>
<tr><td>Website</td><td>£800 one-off</td><td>A full public website for your studio in your brand (home, about, team, hours and FAQs), not just the booking pages, with your live timetable and prices built in</td></tr>
<tr><td>Care plan</td><td>£${CARE.base} a month, or £${CARE.apps} with your own apps, optional, from your second year</td><td>Updates, fixes, email help and the app updates Apple and Google require, after the 12 months included in setup</td></tr>
</tbody></table>
<p>Prices include any VAT that applies, so they stay the same if we become VAT registered. Your choices are in the order form at the end of this section.</p>

<h3>What setup includes</h3>
<p>Setup includes setting up your hosting, email, payments and app store accounts in your name and on your own billing, and 12 months of updates, fixes and support from your go-live date. Our first three studios get 30% off setup, in return for a short case study. Setup also includes:</p>
<ul>
<li>One import of members, memberships and credits from a standard export of your current system.</li>
<li>One round of changes to your brand, wording and layout after you see the demo.</li>
<li>One training session for your team, online or at your studio.</li>
<li>A handover document for your system: what runs where, how to redeploy it and how to update the apps, so another developer could take it over. We keep it up to date while you have the care plan.</li>
</ul>
<p>Anything beyond this, such as a second import, data that needs cleaning by hand or further design rounds, is charged at ${esc(dayRate)} a day. We quote before starting, and you only pay if you agree.</p>

<h3>Paying</h3>
<ul>
<li>We invoice the setup fee in two parts: half when you sign and half when you go live. Or, if the order form says so, you pay over 12 or 24 months. Over 12 months: £400 when you sign then £150 a month for the booking system (£2,200 in total). Your own apps add £200 when you sign then £85 a month (£1,220), and the website adds £200 then £65 a month (£980), so all three together are £800 then £300 a month (£4,400 in total). Over 24 months: £300 when you sign then £90 a month for the booking system (£2,460 in total); your own apps add £100 then £50 a month (£1,300), and the website adds £200 then £35 a month (£1,040), so all three together are £600 then £175 a month (£4,800 in total). Monthly payments start on your go-live date and are collected by Direct Debit or card.</li>
<li>If you choose the care plan, it starts 12 months after your go-live date and is billed monthly by Direct Debit: £${CARE.base} a month, or £${CARE.apps} a month if you have your own apps. A website makes no difference to the price.</li>
<li>Invoices are due within 14 days.</li>
</ul>

<h3>Timeline</h3>
<ul>
<li>Before signing, you can build a working demo in your brand yourself on our website.</li>
<li>A full version to test within 4 weeks of signing, provided you send what we ask for on time, then about two weeks for you and your team to test it. You choose the go-live date, which depends on your current provider's notice period and final data export.</li>
<li>Store apps usually follow a few weeks after you go live, typically in weeks 6 to 10. This depends on Apple and Google approving your accounts and apps, which we do not control.</li>
</ul>

<h3>What updates and the care plan cover</h3>
<p>These are included for 12 months from your go-live date. After that they continue only if you choose the care plan. Without it, app updates that Apple or Google require are £150 each, and other help is charged at ${esc(dayRate)} a day, quoted before we start.</p>
<ul>
<li>Updates and security fixes to the software.</li>
<li>Fixing anything that stops working as described.</li>
<li>Email help on weekdays, normally answered within one working day.</li>
<li>Keeping your store apps up to date when Apple or Google require it.</li>
<li>Small changes when your studio changes: new class types, prices, booking rules, wording and settings, up to two hours of work a month.</li>
</ul>
<p>Bigger changes, such as new features, design changes, extra integrations or work on your own accounts beyond the above, get a fixed quote before we start, and you only pay if you agree. If we ever can't look after it, you get the source code so any developer can (see The software).</p>

<h3>Your accounts and running costs</h3>
<p>We set up your system on accounts in your name and on your own billing: Cloudflare (hosting), Resend or, for large studios, Amazon SES (email), Stripe (payments) and, for store apps, Apple and Google developer accounts. You pay these companies directly, not us, and there is no monthly fee to us. These running costs are usually about £30 a month, about £1 a day, plus Stripe's card fees, all paid to those companies. With store apps, Apple also charges about £79 a year and Google $25 once. This covers studios with up to about 2,000 active clients. Hosting rarely costs more as you grow; email does, because every booking sends confirmations and reminders. Above 2,000 active clients, we move your email from Resend to Amazon SES, a bulk email service in your name, which adds about 60p a month per extra 100 active clients (about £36 a month at 3,000, about £48 at 5,000). We will tell you before costs change. You give us access to these accounts so we can set up and look after the service, and you can remove that access at any time.</p>

<h3>Your data</h3>
<p>You own your data, your brand and your content. Member data is handled under the data processing agreement in section 2. You can export your data at any time. A small "Powered by taal" line appears at the foot of your About page and public web page; you can turn it off at any time in Settings.</p>

<h3>The software</h3>
<p>We own the taal software. Once the setup fee is paid in full, you have a permanent licence to use it for your own studio (while you are paying over 12 or 24 months, you are licensed to use it as long as payments are up to date), at the locations in the order form. You may not sell, share or copy it for anyone else, and each extra location needs its own licence (currently £900). The software runs in your own accounts. If a setup payment or monthly instalment is more than 30 days overdue, we may give 30 days' notice, shown in the system, after which it switches to read-only until the payment is made: bookings and payments stop, but you can still sign in and export all your data. Your data, brand and content stay yours. If we ever stop offering updates, we will give you at least 90 days' notice, and you can keep using the version you have.</p>
<p><b>If we can't look after it.</b> We keep an up-to-date copy of your system's source code. If we stop trading, become insolvent or are unable to provide updates and support for 90 days in a row, we will give you the full source code of your system within 14 days of your request, at no charge. You may then have any developer you choose maintain and change it, for your own studio only; the limits above on selling, sharing and extra locations still apply. Nothing in the system checks in with us in a way that could switch it off if we close.</p>

<h3>Ending the agreement</h3>
<ul>
<li>The care plan runs a year at a time. Either of us can stop it renewing with 30 days' written notice before the renewal date.</li>
<li>Setup fees are not refundable once work has started, except as below.</li>
<li>If we have not delivered a working demo within 2 weeks of receiving what we need from you, you can cancel and we will refund the setup fee.</li>
<li>If you ask us to, we remove our access to your accounts and hand over everything we hold for you. Your licence is permanent, so the system keeps working whether or not you have the care plan.</li>
</ul>

<h3>Responsibility</h3>
<p>We will do the work with reasonable skill and care. Neither of us is responsible for losses the other could not reasonably have foreseen. Our total liability in any 12 months is limited to the fees you paid us in that period. Nothing here limits liability that the law does not allow to be limited.</p>

<h3>General</h3>
<p>This agreement is governed by the law of England and Wales. Changes must be agreed in writing by both of us. You can sign it electronically, and an electronic signature counts the same as one on paper.</p>

<h3>Order form</h3>
<table class="order"><thead><tr><th>Item</th><th>Chosen</th><th>Price</th></tr></thead><tbody>
${lines}${notChosen}
<tr><td>Care plan</td><td>${yes(care)}</td><td>£${q.care} a month, from your second year</td></tr>
<tr><td>Locations</td><td colspan="2">${esc(party.locations || where)}</td></tr>
<tr><td>How you pay</td><td colspan="2">${esc(payLine(q))}${q.founding ? ', with the founding offer of 30% off setup' : ''}</td></tr>
</tbody></table>

<div class="sigs">${sig('taal', client.countersigned)}${sig(name, client.signed)}</div>

<h2>2. Data processing agreement</h2>
<p>The studio is the controller of its members' and staff's personal data. taal is a processor and handles that data only to run the service. This section sets out the terms the UK GDPR (Article 28) requires between the two.</p>
<h3>The data</h3>
<table><tbody>
<tr><th>Whose data</th><td>The studio's members, guests, leads and staff</td></tr>
<tr><th>Kinds of data</th><td>Names, contact details, bookings, attendance, memberships, payment records (not card numbers, which Stripe holds), messages, workout logs</td></tr>
<tr><th>Special category data</th><td>Health questionnaire answers and treatment notes, where the studio uses them</td></tr>
<tr><th>Purpose</th><td>Running bookings, memberships, payments, messages and the back office for the studio</td></tr>
<tr><th>How long</th><td>For as long as the service agreement runs, then returned or deleted as below</td></tr>
</tbody></table>
<h3>What taal agrees to</h3>
<ol>
<li>Process the data only on the studio's documented instructions, which include using the service as designed.</li>
<li>Make sure anyone at taal with access is bound by confidentiality.</li>
<li>Keep the data secure, including two-step sign in, access by role (so health and treatment notes are seen only by the staff the studio chooses), encryption in transit and limited staff access.</li>
<li>Not bring in another processor without telling the studio first and giving it the chance to object. The current list is below.</li>
<li>Help the studio respond to members exercising their rights, such as access, correction and deletion. The service lets the studio export or delete a member's data when they ask.</li>
<li>Help the studio with security, breach notifications and any data protection impact assessment.</li>
<li>Tell the studio without undue delay, and within 48 hours, after becoming aware of a personal data breach.</li>
<li>At the end of the service, return the data to the studio as an export and then delete taal's copies, unless the law requires otherwise.</li>
<li>Give the studio the information it needs to show these terms are met, and allow reasonable audits.</li>
<li>Not transfer the data outside the UK without the safeguards the UK GDPR requires.</li>
</ol>
<h3>Providers</h3>
<p>The studio holds its own accounts with Cloudflare (hosting and database), Resend or Amazon SES (email) and Stripe (payments), and has its own terms with each. taal works inside those accounts on the studio's behalf.</p>
<p>taal's own sub-processors: ${esc(env.SUBPROCESSORS || 'none at present')}.</p>
<p class="version">Agreement version: ${esc(VERSION)}. Signing this page signs both sections.</p>
</article>`;
}

/** The styles the agreement uses, on the signing page and the printable copy. */
export const AGREEMENT_CSS = `
.agreement { font-size:15px; line-height:1.6; color:#33403D; }
.agreement h2 { font-family:'Funnel Display', sans-serif; font-size:24px; letter-spacing:-0.02em; color:#13201E; margin:32px 0 10px; }
.agreement h2:first-child { margin-top:0; }
.agreement h3 { font-family:'Funnel Display', sans-serif; font-size:17px; color:#13201E; margin:22px 0 6px; }
.agreement p { margin:0 0 10px; }
.agreement ul, .agreement ol { margin:0 0 10px; padding-left:20px; }
.agreement li { margin:4px 0; }
.agreement table { width:100%; border-collapse:collapse; margin:6px 0 12px; font-size:14px; }
.agreement th, .agreement td { text-align:left; vertical-align:top; padding:8px 10px 8px 0; border-bottom:1px solid #D3DAD3; }
.agreement thead th { color:#55625F; font-size:13px; font-weight:600; border-bottom:2px solid #13201E; }
.agreement tbody th { color:#55625F; font-weight:600; width:32%; }
.agreement .sigs { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:18px 0 8px; }
.agreement .sig { border-top:2px solid #13201E; padding-top:8px; }
.agreement .sig p { margin:0; font-size:13px; color:#55625F; }
.agreement .sig .sig-name { font-family:'Funnel Display', sans-serif; font-size:22px; color:#13201E; font-style:italic; margin-bottom:2px; }
.agreement .sig-empty { border-top-style:dashed; border-color:#C9CFC6; }
.agreement .version { margin-top:22px; font-size:13px; color:#55625F; }
@media (max-width:600px) { .agreement .sigs { grid-template-columns:1fr; } }
`;
