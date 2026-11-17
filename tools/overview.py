"""
The taal overview: a three-page PDF that goes with every call summary (public/taal-overview.pdf).
Prices come from src/prices.js's ITEMS (kept in step by hand: change both). Run: python3 tools/overview.py
"""
import asyncio, os
from playwright.async_api import async_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'public'))
F = f'file://{ROOT}'
ITEMS = [('Booking system', 1900, (400, 150), (300, 90), 'Members book, pay and check in on phone or computer. Back office, team diaries, memberships, packs, waitlists, gift cards and reports.'),
         ('Your own apps', 1000, (200, 85), (100, 50), 'Your app on the App Store and Google Play, under your name, with notifications.'),
         ('Website', 800, (200, 65), (200, 35), 'A full website in your brand with your live timetable and prices built in.')]
g = lambda n: f'£{n:,}'
MARK = '<svg width="{s}" height="{s}" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4" width="3" height="16" rx="1.5" fill="#A8382B"/><rect x="8.5" y="7" width="3" height="10" rx="1.5" fill="#0F5C57"/><circle cx="15.5" cy="12" r="2.1" fill="none" stroke="#13201E" stroke-width="1.6"/><rect x="19.5" y="7" width="3" height="10" rx="1.5" fill="#0F5C57"/></svg>'

def phone(img, cap):
  return f'<figure class="ph"><div class="fr"><img src="{F}/img/{img}.jpg"></div><figcaption>{cap}</figcaption></figure>'

def head(n):
  return f'<header>{MARK.format(s=22)}<b>taal</b><span>Studio software for independent gyms, studios and clubs</span><i>{n} of 3</i></header>'

rows = ''.join(f'<tr><td><b>{n}</b><br><small>{d}</small></td><td>{g(o)}</td><td>{g(a[0])} then {g(a[1])} a month</td><td>{g(b[0])} then {g(b[1])} a month</td></tr>' for n, o, a, b, d in ITEMS)
all_once = sum(i[1] for i in ITEMS); s12 = sum(i[2][0] for i in ITEMS); m12 = sum(i[2][1] for i in ITEMS); s24 = sum(i[3][0] for i in ITEMS); m24 = sum(i[3][1] for i in ITEMS)

HTML = f"""<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>taal overview</title><style>
@font-face {{ font-family:'FD'; src:url('{F}/fonts/funnel-display.woff2'); font-weight:300 800; }}
@font-face {{ font-family:'FS'; src:url('{F}/fonts/funnel-sans.woff2'); font-weight:300 800; }}
@page {{ size:A4; margin:0; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; font-family:'FS', sans-serif; color:#13201E; -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
.pg {{ width:210mm; height:297mm; padding:14mm 15mm 12mm; background:#F2F3EE; position:relative; overflow:hidden; page-break-after:always; }}
header {{ display:flex; align-items:center; gap:7px; font-size:9pt; color:#55625F; border-bottom:1px solid #D3DAD3; padding-bottom:4mm; }}
header b {{ font-family:'FD'; font-size:16pt; color:#13201E; letter-spacing:-.03em; margin-right:6px; }}
header i {{ margin-left:auto; font-style:normal; }}
h1 {{ font-family:'FD'; font-weight:650; font-size:44pt; line-height:.98; letter-spacing:-.045em; margin:9mm 0 5mm; }}
h2 {{ font-family:'FD'; font-weight:650; font-size:24pt; letter-spacing:-.03em; margin:7mm 0 3.5mm; line-height:1.05; }}
h3 {{ font-family:'FD'; font-weight:650; font-size:13pt; margin:0 0 1.5mm; }}
p {{ margin:0; }}
.lede {{ font-size:14pt; line-height:1.45; color:#33403D; max-width:150mm; }}
.phones {{ display:flex; gap:7mm; justify-content:center; margin:8mm 0 7mm; }}
.ph {{ margin:0; width:44mm; }}
.fr {{ border-radius:7mm; overflow:hidden; border:2.2mm solid #13201E; background:#13201E; }}
.fr img {{ display:block; width:100%; }}
figcaption {{ text-align:center; font-size:9pt; color:#55625F; margin-top:3mm; }}
.three {{ display:grid; grid-template-columns:repeat(3, 1fr); gap:5mm; }}
.card {{ background:#fff; border-radius:5mm; padding:5mm; font-size:9.6pt; line-height:1.5; color:#33403D; }}
.card h3 {{ color:#13201E; }}
.seal {{ color:#A8382B; }}
.steps {{ display:grid; gap:3mm; }}
.step {{ display:grid; grid-template-columns:11mm 1fr 30mm; gap:4mm; align-items:start; background:#fff; border-radius:5mm; padding:3.6mm 5mm; font-size:10pt; line-height:1.45; color:#33403D; }}
.step .n {{ width:9mm; height:9mm; border-radius:50%; background:#E3E9E3; color:#0F5C57; font-weight:700; display:grid; place-items:center; font-size:11pt; }}
.step .t {{ color:#55625F; font-size:9.5pt; text-align:right; padding-top:1mm; }}
.inc {{ columns:2; column-gap:8mm; font-size:10pt; line-height:1.5; color:#33403D; padding:0; margin:0; list-style:none; }}
.inc li {{ break-inside:avoid; padding:0 0 3mm 6mm; position:relative; }}
.inc li::before {{ content:''; position:absolute; left:0; top:2.2mm; width:2.4mm; height:2.4mm; border-radius:50%; background:#0F5C57; }}
table {{ width:100%; border-collapse:collapse; background:#fff; border-radius:5mm; overflow:hidden; font-size:10.5pt; }}
th, td {{ text-align:left; padding:3mm 4mm; border-bottom:1px solid #E3E9E3; vertical-align:top; }}
th {{ font-size:9pt; color:#55625F; font-weight:600; background:#F7F8F4; }}
td small {{ color:#55625F; font-size:8.8pt; line-height:1.4; display:block; margin-top:1mm; max-width:70mm; }}
tr.tot td {{ font-weight:700; background:#E3E9E3; border-bottom:0; }}
.note {{ font-size:10pt; color:#33403D; line-height:1.55; }}
.band {{ background:#0F5C57; color:#F2F3EE; border-radius:6mm; padding:6mm 8mm; margin-top:6mm; }}
.band h2 {{ margin:0 0 3mm; color:#fff; }}
.band p {{ font-size:11.5pt; line-height:1.5; }}
.band a {{ color:#fff; }}
.foot {{ position:absolute; left:15mm; right:15mm; bottom:9mm; font-size:8.5pt; color:#55625F; display:flex; justify-content:space-between; border-top:1px solid #D3DAD3; padding-top:3mm; }}
</style></head><body>

<section class="pg">{head(1)}
<h1>Your own booking app.<br>In your brand.<br><span class="seal">That you own.</span></h1>
<p class="lede">Bookings, memberships and payments for independent gyms, studios and clubs, under your own name. Replaces the likes of Mindbody, Glofox and TeamUp, without the monthly fee.</p>
<div class="phones">{phone('home', 'Your members\u2019 home screen')}{phone('book', 'Booking a class')}{phone('revenue', 'Your back office')}</div>
<div class="three">
<div class="card"><h3>Your brand</h3>Your name, logo, colours and words, on your own web address and, if you like, the App Store and Google Play.</div>
<div class="card"><h3>Your data</h3>Kept in accounts in your own name. If you ever leave, everything goes with you.</div>
<div class="card"><h3>No monthly fee to us</h3>Pay once, or spread it over 12 or 24 months. Running costs of about £1 a day go to your own providers.</div>
</div>
<div class="foot"><span>taal.solutions</span><span>taal means rhythm: keep your studio in sync</span></div></section>

<section class="pg">{head(2)}
<h2>What's included</h2>
<ul class="inc">
<li>Members book classes, appointments and treatments, buy memberships and packs, and check in with a QR code</li>
<li>Waitlists that fill themselves, reminders, cancellations and late-cancel rules</li>
<li>Memberships by Direct Debit or card, with freezes, add-ons, intro offers and gift cards</li>
<li>Back office: timetable, team diaries, member profiles, health forms, notes and messages</li>
<li>Reports: revenue, attendance, members at risk and how each class is doing</li>
<li>Your members, memberships and credits moved across from your current system</li>
<li>Training for your team, and 12 months of updates and support from go-live</li>
<li>The source code if we ever can't look after it, so any developer can</li>
</ul>
<h2>How it works</h2>
<div class="steps">
<div class="step"><span class="n">1</span><div><h3>Sign online</h3>Read your agreement and sign it in a couple of minutes. Your private portal opens straight away.</div><span class="t">Day one</span></div>
<div class="step"><span class="n">2</span><div><h3>Send us your details</h3>Logo, photos, colours, classes, timetable, prices and team, through a simple upload page that saves as you go.</div><span class="t">Your first week</span></div>
<div class="step"><span class="n">3</span><div><h3>Set up your accounts</h3>Hosting, payments, email and the app stores, in your name, with a step by step guide for each.</div><span class="t">Alongside</span></div>
<div class="step"><span class="n">4</span><div><h3>Review your app</h3>We build it from what you sent. You try it as a member, coach and owner, then approve it or ask for changes.</div><span class="t">Within 4 weeks</span></div>
<div class="step"><span class="n">5</span><div><h3>Go live</h3>Payments and email connected, members moved across, team trained. You pick the date. Store apps follow, usually within weeks.</div><span class="t">When you're ready</span></div>
</div>
<p class="note" style="margin-top:6mm">For fitness, wellness, yoga and Pilates, dance, martial arts, climbing and saunas: up to 2,000 active clients, larger studios by quote.</p>
<div class="foot"><span>taal.solutions</span><span>Studio software made in London</span></div></section>

<section class="pg">{head(3)}
<h2>Prices</h2>
<table><thead><tr><th>What you choose</th><th>Pay once</th><th>Over 12 months</th><th>Over 24 months</th></tr></thead><tbody>
{rows}
<tr class="tot"><td>All three</td><td>{g(all_once)}</td><td>{g(s12)} then {g(m12)} a month</td><td>{g(s24)} then {g(m24)} a month</td></tr>
</tbody></table>
<p class="note" style="margin-top:4mm">Prices include VAT and don't change. Paying once is in two parts: half when you sign and half when you go live. Monthly payments start at go-live.</p>
<div class="three" style="margin-top:7mm">
<div class="card"><h3>Running costs</h3>About £30 a month for hosting and email, paid straight to Cloudflare and Resend in your name. Card fees go straight to Stripe with nothing added, or keep your current payment provider where possible. Store apps add about £79 a year to Apple.</div>
<div class="card"><h3>Care plan</h3>Optional, from your second year: £30 a month, or £40 with your own apps, for updates, fixes and help. Stop it any year with 30 days' notice.</div>
<div class="card"><h3 class="seal">Founding offer</h3>30% off setup for our first three studios, in return for a short case study.</div>
</div>
<div class="band"><h2>Next step</h2><p>Reply to the email this came with, and we'll send your agreement to sign online. Prefer to see it first? Build a free demo of your own app in about a minute at <a href="https://taal.solutions/demo">taal.solutions/demo</a>.</p><p style="margin-top:4mm">Tim Allan, founder &nbsp; <a href="mailto:hello@taal.solutions">hello@taal.solutions</a></p></div>
<div class="foot"><span>taal.solutions</span><span>Prices as of November 2026</span></div></section>
</body></html>"""

async def main():
  path = '/tmp/taal-overview.html'
  open(path, 'w').write(HTML)
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = await b.new_page()
    await pg.goto(f'file://{path}'); await pg.wait_for_timeout(800)
    await pg.pdf(path=os.path.join(ROOT, 'taal-overview.pdf'), width='210mm', height='297mm', print_background=True, prefer_css_page_size=True)
    await b.close()
  print('wrote public/taal-overview.pdf')

asyncio.run(main())
