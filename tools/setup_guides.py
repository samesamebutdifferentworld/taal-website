"""
Step by step guides for the accounts a studio sets up in its own name: taal.solutions/setup/<account>.
Linked from each studio's portal. Run: python3 tools/setup_guides.py

Screenshots: put a picture of a step at public/img/setup/<guide>-<step>.png (e.g. stripe-3.png) and
run this again; it appears under that step. Take them while doing the timed test build, so they match
what studios see today. Check the steps every few months and update CHECKED.
"""
import html, os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public')
CHECKED = 'November 2026'
US = 'hello@taal.solutions'

GUIDES = [
  ('apple', 'Apple Developer', 'Your app on the App Store, in your name',
   'Apple checks your business before it lets you publish, and that can take a couple of weeks, so start this one first. It costs $99 a year (about £79), paid to Apple.',
   [
     ('Check what Apple needs from you', 'If your studio is a limited company, you enrol as an organisation and your company name shows as the seller on the App Store. You need: your company\'s exact legal name, its D-U-N-S number (free, step 2), a website on your own domain, an email address on that domain, and the authority to sign for the company. If you\'re a sole trader or partnership, Apple only lets you enrol as an individual, so your own name shows as the seller: skip step 2.'),
     ('Get your D-U-N-S number', 'Go to developer.apple.com/enroll/duns-lookup and search for your company exactly as it appears at Companies House. If it\'s listed, note the nine-digit number. If not, choose to request one: Dun & Bradstreet emails it to you, usually within a week, sometimes longer. It\'s free.'),
     ('Turn on two-factor sign-in for your Apple Account', 'Use the Apple Account you\'ll keep for the business (it can be your own). On an iPhone: Settings, your name, Sign-In & Security, Two-Factor Authentication. Apple won\'t let you enrol without it.'),
     ('Enrol', 'The easiest way is the Apple Developer app on an iPhone or iPad: open it, tap Account, then Enroll Now. Or go to developer.apple.com/programs/enroll on a computer. Choose Organisation (or Individual if you\'re a sole trader), enter your details exactly as on your D-U-N-S record, and pay the yearly fee.'),
     ('Answer Apple\'s call or email', 'Apple usually checks with a phone call or email that you can sign for the company. Once you\'re approved, you\'ll get an email saying welcome to the Apple Developer Program.'),
     ('Add us so we can publish your app', f'Go to appstoreconnect.apple.com, then Users and Access, then the + button. Enter {US}, choose the Admin role, and send the invitation. That lets us set up your app, upload it and send it to Apple for review. You can remove us at any time.'),
   ]),
  ('google', 'Google Play', 'Your app on Google Play, in your name',
   'Google charges a one-off $25 (about £20). As an organisation, you\'ll use the same D-U-N-S number as for Apple, so do Apple\'s step 2 first.',
   [
     ('Sign in with the Google account you\'ll keep for the business', 'Go to play.google.com/console/signup. Use an account you\'ll keep, ideally one for the business rather than a personal Gmail.'),
     ('Choose an organisation account', 'Choose Organisation if your studio is a limited company (you\'ll need your D-U-N-S number), or Yourself if you\'re a sole trader. Organisation accounts can publish straight away; new personal accounts have to run a two-week test with 12 people first, which we can help with.'),
     ('Enter your details and pay', 'Fill in your organisation\'s details exactly as on your D-U-N-S record, a contact email and phone, and pay the $25. Google then verifies your identity and organisation, which can take a few days.'),
     ('Add us so we can publish your app', f'In Play Console, go to Users and permissions, then Invite new users. Enter {US}, give Admin (all permissions) on the account, and send. You can remove us at any time.'),
   ]),
  ('cloudflare', 'Cloudflare', 'Where your app and website run',
   'Your app, website and database live in your own Cloudflare account. It\'s free to start; once you\'re live, the Workers paid plan is $5 a month (about £4), which covers most studios.',
   [
     ('Sign up', 'Go to dash.cloudflare.com/sign-up and create an account with an email address you\'ll keep for the business. Confirm your email from the message Cloudflare sends.'),
     ('Turn on two-factor sign-in', 'Click the person icon at the top right, then Profile, then Authentication. Turn on two-factor authentication with an authenticator app, and keep the backup codes somewhere safe.'),
     ('Add us as a member', f'From the account home, open Manage Account, then Members, then Invite. Enter {US}, choose the Administrator role, and send the invitation. That lets us set up and look after your app; you stay the owner and can remove us at any time.'),
     ('Add a payment method when we ask', 'We\'ll tell you when to move to the paid Workers plan (usually at go-live). Add your card under Manage Account, then Billing.'),
   ]),
  ('stripe', 'Stripe', 'Takes your members\' payments and pays you',
   'Stripe takes card and Direct Debit payments from your members and pays them into your bank account. There\'s no monthly fee: Stripe takes a small fee from each payment.',
   [
     ('Sign up', 'Go to dashboard.stripe.com/register and create an account with your business email. If you already have a Stripe account for your studio, use that one and skip to step 3.'),
     ('Activate payments', 'Stripe asks for your business type, company number (if you have one), your address, your own details as the owner, and the bank account for payouts. Have your ID ready: Stripe may ask for a photo of it. Activation is usually quick.'),
     ('Turn on two-step sign-in', 'Settings, then Personal details, then Two-step authentication. Use an authenticator app.'),
     ('Turn on Direct Debit', 'Settings, then Payment methods, then Bacs Direct Debit: turn it on. Stripe may ask a few more questions before it approves it. This is what lets members pay their memberships by Direct Debit.'),
     ('Add us to your team', f'Settings, then Team and security, then Add member. Enter {US} and choose the Administrator role. We use it to connect your app and set up your products; we never see your members\' card numbers.'),
     ('Add your logo and colours', 'Settings, then Branding: add your logo, icon and brand colour, so receipts and payment pages look like you.'),
   ]),
  ('resend', 'Resend', 'Sends your booking emails from your own address',
   'Booking confirmations, reminders and receipts go out from your own address, such as bookings@yourstudio.co.uk, through Resend. It\'s free for up to 3,000 emails a month; most studios stay on the free plan or its $20 plan.',
   [
     ('Sign up', 'Go to resend.com/signup and create an account with your business email.'),
     ('Add your domain', 'Open Domains, then Add domain, and enter your studio\'s web address (for example yourstudio.co.uk). Pick the region nearest you (Ireland is fine for the UK).'),
     ('Let it set up the DNS', 'If your domain is on Cloudflare (see the domain guide), choose the option to set up the records with Cloudflare automatically and approve it. Otherwise, leave this step to us once you\'ve added us below.'),
     ('Add us to your team', f'Open Settings, then Team, and invite {US}. If your plan doesn\'t let you invite people, reply to any of our emails and we\'ll finish this together on a short screen share instead.'),
   ]),
  ('domain', 'Your web address', 'Pointing your domain at your new app and site',
   'Your app and website go on your own web address. If you already have one, it stays yours and stays where it\'s registered: we only move where it points. If you don\'t have one yet, buy one first from any registrar (123 Reg, Namecheap, GoDaddy and others).',
   [
     ('Find where your domain is registered', 'It\'s wherever you pay for it each year: look for the renewal email. Sign in there and find the page called DNS, Nameservers or Manage domain.'),
     ('Add it to Cloudflare', 'In your Cloudflare account (see the Cloudflare guide), choose Add a domain, enter your web address, and pick the Free plan. Cloudflare copies your existing settings, including your email, so nothing stops working. Check the list it shows: your email records (MX) should be there.'),
     ('Change the nameservers', 'Cloudflare shows you two nameservers, such as anna.ns.cloudflare.com. At your registrar, replace the existing nameservers with these two and save. It can take from a few minutes to a day to switch over; Cloudflare emails you when it\'s done.'),
     ('Tell us when it\'s active', 'Tick it off in your portal. We then point your app and website at it on go-live day, so your current website keeps working until then.'),
   ]),
]

ORDER = ['apple', 'google', 'cloudflare', 'stripe', 'resend', 'domain']
LOGO = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4" width="3" height="16" rx="1.5" fill="#A8382B"/><rect x="8.5" y="7" width="3" height="10" rx="1.5" fill="#0F5C57"/><circle cx="15.5" cy="12" r="2.1" fill="none" stroke="#13201E" stroke-width="1.6"/><rect x="19.5" y="7" width="3" height="10" rx="1.5" fill="#0F5C57"/></svg>'

CSS = """
@font-face { font-family:'Funnel Display'; src:url('/fonts/funnel-display.woff2') format('woff2'); font-weight:300 800; font-display:swap; }
@font-face { font-family:'Funnel Sans'; src:url('/fonts/funnel-sans.woff2') format('woff2'); font-weight:300 800; font-display:swap; }
* { box-sizing:border-box; }
body { margin:0; background:#F2F3EE; color:#13201E; font-family:'Funnel Sans', system-ui, sans-serif; font-size:17px; line-height:1.6; -webkit-font-smoothing:antialiased; }
a { color:#0F5C57; text-underline-offset:3px; }
.page { max-width:760px; margin:0 auto; padding:24px 22px 72px; }
.top { display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:40px; }
.logo { display:inline-flex; gap:8px; align-items:center; font-family:'Funnel Display', sans-serif; font-weight:650; font-size:22px; letter-spacing:-0.03em; color:#13201E; text-decoration:none; }
button { font:inherit; font-weight:600; font-size:15px; background:#0F5C57; color:#fff; border:0; border-radius:999px; padding:10px 18px; cursor:pointer; }
.kicker { font-size:15px; color:#55625F; margin:0 0 8px; }
h1 { font-family:'Funnel Display', sans-serif; font-weight:650; font-size:clamp(38px, 6vw, 56px); line-height:1; letter-spacing:-0.04em; margin:0 0 18px; }
.intro { font-size:19px; color:#33403D; margin:0 0 30px; max-width:640px; }
ol.steps { list-style:none; counter-reset:s; padding:0; margin:0; }
ol.steps > li { counter-increment:s; position:relative; background:#fff; border-radius:20px; padding:22px 24px 22px 74px; margin:0 0 12px; break-inside:avoid; }
ol.steps > li::before { content:counter(s); position:absolute; left:22px; top:20px; width:34px; height:34px; border-radius:50%; background:#E3E9E3; color:#0F5C57; font-weight:700; font-size:15px; display:grid; place-items:center; }
ol.steps h2 { font-family:'Funnel Display', sans-serif; font-weight:650; font-size:21px; letter-spacing:-0.01em; margin:2px 0 6px; }
ol.steps p { margin:0; color:#33403D; }
figure { margin:14px 0 0; }
figure img { width:100%; height:auto; border-radius:12px; border:1px solid #D3DAD3; display:block; }
.done { margin-top:26px; background:#0F5C57; color:#F2F3EE; border-radius:20px; padding:22px 24px; }
.done b { font-family:'Funnel Display', sans-serif; font-size:20px; display:block; margin-bottom:4px; }
.done a { color:#fff; }
.foot { margin-top:30px; font-size:14px; color:#55625F; }
.list { list-style:none; padding:0; margin:0; }
.list li { background:#fff; border-radius:18px; margin:0 0 10px; }
.list a { display:block; padding:18px 22px; text-decoration:none; color:#13201E; }
.list b { font-family:'Funnel Display', sans-serif; font-size:21px; display:block; }
.list span { color:#55625F; font-size:15px; }
@media (max-width:560px) { ol.steps > li { padding:20px 18px 20px 62px; } ol.steps > li::before { left:16px; } }
@media print {
  body { background:#fff; font-size:12pt; }
  .page { padding:0; max-width:none; }
  .noprint { display:none; }
  ol.steps > li { border:1px solid #D3DAD3; }
  .done { background:#fff; color:#13201E; border:1.5px solid #0F5C57; }
  .done a { color:#0F5C57; }
  @page { margin:16mm 15mm; }
}
"""

def page(title, desc, body):
  return f"""<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}: taal setup guide</title>
<meta name="description" content="{html.escape(desc)}">
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>{CSS}</style>
</head>
<body><div class="page">
<div class="top"><a class="logo" href="/setup/">{LOGO}taal</a><button class="noprint" onclick="print()">Save as PDF</button></div>
{body}
<p class="foot">taal setup guide, checked {CHECKED}. Screens change from time to time: if something looks different, email <a href="mailto:{US}">{US}</a> and we'll help.</p>
</div></body></html>
"""

def guide(key, name, line, intro, steps):
  items = []
  for i, (h, t) in enumerate(steps, 1):
    shot = f'img/setup/{key}-{i}.png'
    fig = f'<figure><img src="/{shot}" alt="{html.escape(h)}" loading="lazy"></figure>' if os.path.exists(os.path.join(ROOT, shot)) else ''
    items.append(f'<li><h2>{html.escape(h)}</h2><p>{html.escape(t)}</p>{fig}</li>')
  body = f"""<p class="kicker">Setup guide: {html.escape(name)}</p>
<h1>{html.escape(line)}</h1>
<p class="intro">{html.escape(intro)}</p>
<ol class="steps">{''.join(items)}</ol>
<div class="done"><b>All done?</b>Tick {html.escape(name)} off under Accounts in your portal, and we'll take it from there. Stuck on a step? Reply to any of our emails or write to <a href="mailto:{US}">{US}</a>.</div>"""
  return page(name, line, body)

def main():
  out = os.path.join(ROOT, 'setup')
  os.makedirs(out, exist_ok=True)
  by = {g[0]: g for g in GUIDES}
  for g in GUIDES:
    open(os.path.join(out, f'{g[0]}.html'), 'w').write(guide(*g))
  links = ''.join(f'<li><a href="/setup/{k}"><b>{html.escape(by[k][1])}</b><span>{html.escape(by[k][2])}</span></a></li>' for k in ORDER)
  idx = f"""<p class="kicker">Setup guides</p><h1>Your accounts, in your name</h1>
<p class="intro">Everything taal sets up runs in accounts you own, so it all stays yours. These guides take you through each one, step by step. Start with Apple and Google if you're having your own apps: they take the longest to approve.</p>
<ul class="list">{links}</ul>"""
  open(os.path.join(out, 'index.html'), 'w').write(page('Setup guides', 'Step by step guides for the accounts taal studios set up in their own name.', idx))
  print('wrote', len(GUIDES) + 1, 'pages')

if __name__ == '__main__':
  main()
