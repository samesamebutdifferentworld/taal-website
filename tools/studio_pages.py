"""Builds the studio pages (gyms, wellness, yoga, Pilates) from the copy the
studio-type toggle uses in index.html, and keeps the nav and footer of every
inner page the same.

Run from the repo root:  python3 tools/studio_pages.py
"""
import html, json, re, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / 'public'
T = json.loads(subprocess.check_output(['node', str(ROOT / 'tools/extract_t.js'), str(PUB / 'index.html')]))

MARK = ('<svg{cls} width="{s}" height="{s}" viewBox="0 0 24 24" aria-hidden="true">'
        '<rect class="ts" x="2.5" y="4" width="3" height="16" rx="1.5" fill="#A8382B"/>'
        '<rect class="t2" x="8.5" y="7" width="3" height="10" rx="1.5" fill="#0F5C57"/>'
        '<circle class="tk" cx="15.5" cy="12" r="2.1" fill="none" stroke="#13201E" stroke-width="1.6"/>'
        '<rect class="t3" x="19.5" y="7" width="3" height="10" rx="1.5" fill="#0F5C57"/></svg>')

# The large looping mark used as the art on the compare and leaving pages.
ART = ('<div class="art" aria-hidden="true"><svg class="tala-loop" viewBox="0 0 24 24">'
       '<rect class="ts" x="2.5" y="4" width="3" height="16" rx="1.5" fill="#A8382B"/>'
       '<rect class="t2" x="8.5" y="7" width="3" height="10" rx="1.5" fill="#0F5C57"/>'
       '<circle class="tk" cx="15.5" cy="12" r="2.1" fill="none" stroke="#13201E" stroke-width="1.4"/>'
       '<rect class="t3" x="19.5" y="7" width="3" height="10" rx="1.5" fill="#0F5C57"/></svg></div>')

FAVICON = ("data:image/svg+xml,%3Csvg width='64' height='64' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E"
           "%3Crect width='24' height='24' rx='5.76' fill='%230F5C57'/%3E%3Cg transform='translate(3.5 3.5) scale(0.7083)'%3E"
           "%3Crect x='2.5' y='4' width='3' height='16' rx='1.5' fill='%23E59A8C'/%3E%3Crect x='8.5' y='7' width='3' height='10' rx='1.5' fill='%23F2F3EE'/%3E"
           "%3Ccircle cx='15.5' cy='12' r='2.1' fill='none' stroke='%23F2F3EE' stroke-width='1.8'/%3E"
           "%3Crect x='19.5' y='7' width='3' height='10' rx='1.5' fill='%23F2F3EE'/%3E%3C/g%3E%3C/svg%3E")

# file, key in T, menu label, how the page names the studio, the team, the sample brand
KINDS = [
    ('gyms.html', 'fitness', 'Gyms', 'your gym', 'coaches', ('Forge', '#24365C')),
    ('wellness.html', 'wellness', 'Wellness', 'your wellness studio', 'therapists', ('Haven', '#155E5A')),
    ('yoga-pilates.html', 'yoga', 'Yoga and Pilates', 'your yoga or Pilates studio', 'teachers', ('Still', '#5E2C4E'), 'yoga and Pilates studios'),
    ('dance.html', 'dance', 'Dance', 'your dance studio', 'teachers', ('Pulse', '#8A3324')),
    ('martial-arts.html', 'martial', 'Martial arts', 'your martial arts club', 'coaches', ('Kaizen', '#3B2F2F')),
    ('climbing.html', 'climbing', 'Climbing', 'your climbing wall', 'staff', ('Crux', '#4D5A2C')),
]

# Old addresses that now live on a combined page.
REDIRECTS = {'yoga.html': 'yoga-pilates.html', 'pilates.html': 'yoga-pilates.html'}

e = html.escape


def nav(current=''):
    items = [('compare.html', 'Compare costs'), ('index.html#pricing', 'Pricing'), ('leaving.html', 'Leaving taal')]
    lis = ''.join(f'<li><a href="{h}"{" aria-current=\"page\"" if h == current else ""}>{t}</a></li>' for h, t in items)
    return (f'<nav><div class="wrap">\n  <a class="logo" href="index.html" aria-label="taal home">{MARK.format(s=24, cls=' class="beat"')}taal</a>\n'
            f'  <ul>{lis}</ul>\n  <a class="btn btn-seal" href="demo.html">Build your demo</a>\n</div></nav>')


def footer(current=''):
    def a(h, t, extra=''):
        return f'<a href="{h}"{extra}{" aria-current=\"page\"" if h == current else ""}>{t}</a>'
    studios = ''.join(a(f, label) for f, _, label, *_ in KINDS)
    before = a('compare.html', 'Compare costs') + a('leaving.html', 'Leaving taal') + a('privacy.html', 'Privacy') + '<a class="mail" href="mailto:hello@taal.solutions">Contact</a>'
    return (f'<footer><div class="wrap foot">\n'
            f'  <div class="foot-brand"><a class="logo" href="index.html" aria-label="taal home">{MARK.format(s=20, cls='')}taal</a><p>Studio software made in London for independent gyms, studios and clubs.</p></div>\n'
            f'  <div class="foot-col foot-two"><span class="foot-h">For your studio</span>{studios}</div>\n'
            f'  <div class="foot-col"><span class="foot-h">Before you sign</span>{before}</div>\n'
            '</div></footer>\n'
            "<script>(function () { const EMAIL = 'hello@taal.solutions'; if (EMAIL.includes('@')) document.querySelectorAll('a.mail').forEach(a => { a.href = 'mailto:' + EMAIL; if (a.textContent === 'EMAIL') a.textContent = EMAIL; });\n"
            "  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('seen'); io.unobserve(e.target); } }), { threshold: .35 });\n"
            "  document.querySelectorAll('.coda, .line-in').forEach(el => io.observe(el));\n"
            "  if (location.hash) { const d = document.querySelector(location.hash); if (d && d.tagName === 'DETAILS') d.open = true; }\n"
            "})();</script>")


def head(title, desc):
    return f'''<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:image" content="https://taal.solutions/img/share.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="taal: your own booking app, in your brand, that you own">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#F2F3EE">
<link rel="icon" href="{FAVICON}">
<link rel="preload" href="fonts/funnel-display.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="page.css">
</head>
<body>
'''


def phone(k, brand, colour):
    tiles = ''.join(f'<div class="app-tile" style="--img:url(\'img/app/{img}.svg\')"><span>{e(t)}</span></div>' for t, img in k['tiles'])
    rows = ''.join(f'<div class="app-row"><span>{e(n)}</span><i style="--w:{w}%"></i><b>{e(v)}</b></div>' for n, w, v, *_ in k['rows'])
    nw, nn, nwith = k['next']
    return f'''<div class="phone" aria-label="Sample {e(k['sub'].lower())} studio app, home screen">
      <div class="app" style="--brand:{colour}">
        <div class="app-top">
          <div class="app-id"><span class="app-mono" aria-hidden="true">{brand[0]}</span><span class="app-words"><span class="app-name">{brand}</span><span class="app-sub">{e(k['sub'])}</span></span></div>
          <span class="app-chat" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4z"/></svg></span>
        </div>
        <div class="app-hero"><small>Good morning</small><b>Alex</b>
          <div class="app-next"><div><small>{e(nw)}</small><strong>{e(nn)}</strong><span>{e(nwith)}</span></div><span class="app-qr">Entry QR</span></div>
        </div>
        <div class="app-tiles">{tiles}</div>
        <div class="app-head"><b>Your credits</b><a>Buy more</a></div>
        <div class="app-card"><h4>{e(k['card'][0])} <span>{e(k['card'][1])}</span></h4>{rows}</div>
        <div class="app-nav" aria-hidden="true">
          <span class="on"><svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>Home</span>
          <span><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>Book</span>
          <span class="qr"><i><svg viewBox="0 0 24 24"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/></svg></i>Sign in</span>
          <span><svg viewBox="0 0 24 24"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/></svg>Buy</span>
          <span><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>Me</span>
        </div>
      </div>
    </div>'''


def cols(pairs, cls=''):
    return f'<div class="cols{cls}">' + ''.join(f'<div><h3>{e(h)}</h3><p>{e(p)}</p></div>' for h, p in pairs) + '</div>'


def fold(id_, title, small, body, open_=False):
    return (f'<details class="fold" id="{id_}"{" open" if open_ else ""}><summary><h2>{title}</h2><small>{small}</small></summary>\n'
            f'  <div class="in">{body}</div>\n</details>')


def coda(title, text, href, extra=''):
    return f'''<section class="coda">
  <div class="giant" aria-hidden="true"><span class="g-sam"></span><span>taal</span></div>
  <div class="wrap">
    <h2>{title}</h2>
    <div class="cta"><p>{text}</p><a class="btn btn-seal" href="{href}">Try your free demo</a>{extra}</div>
  </div>
</section>'''


def studio_page(file, key, label, studio, team, brand, plural=None):
    k = T[key]; c = k['copy']
    people = c['people']
    plural = plural or studio.replace('your ', '') + 's'
    title = f'Booking app for {plural}: taal'
    desc = f"Your own booking app for {plural}, in your brand. {c['show1']} Pay once from £1,900, with no monthly fee to us."
    others = ''.join(f'<a href="{f}"{" aria-current=\"page\"" if f == file else ""}>{l}</a>' for f, _, l, *_ in KINDS)
    folds = '\n'.join([
        fold('members', f'For your {people}', 'Their own app, in your name', cols([(c['f1h'], c['f1']), (c['f2h'], c['f2']), (c['f3h'], c['f3']), (c['f4h'], c['f4'])], ' four')),
        fold('team', f'For your {team}', 'Their diary, notes and plans', cols([(c['show3h'], c['show3']), (c['t3h'], c['t3']), (c['t4h'], c['t4'])])),
        fold('studio', 'For you', 'One place for it all', cols([(c['s1h'], c['s1']), (c['show2h'], c['show2']), (c['s3h'], c['s3']), ('Moving across', c['s6'])], ' four')),
    ])
    lede = f"{e(c['show1'])} In your name, on your {people}' phones. Pay once from £1,900."
    out = head(title, desc) + nav() + f'''

<header class="head"><div class="wrap">
  <div>
    <h1><span>Your own booking app.</span><span class="tone">For {studio}.</span></h1>
    <p class="lede">{lede}</p>
    <div class="go"><a class="btn btn-seal" href="demo.html?type={key}">Try your free demo</a><span>Ready in about a minute, with just your email</span></div>
  </div>
  <div class="art phone-wrap">
    {phone(k, *brand)}
  </div>
</div></header>

<div class="folds"><div class="wrap">
{folds}
</div></div>

<section class="band"><div class="wrap">
  <h2 class="h2">Pay once. Then it's yours.</h2>
  <div class="figs">
    <div><b>£1,900</b><span>Once, for the booking system</span></div>
    <div><b>£2,900</b><span>With your own apps</span></div>
    <div><b>£30</b><span>A month to hosting and email, not to us</span></div>
  </div>
  <p class="note" style="margin-top:18px">Prices include VAT. Built around how your studio works. The care plan after year one is optional, at £300 a year.</p>
  <div class="links-row"><a href="compare.html">Compare three years</a><a href="index.html#pricing">Build your price</a><a href="leaving.html">What you keep if you leave</a></div>
</div></section>

''' + coda(f'See {studio} in it first.', 'A working version of your app, with your name and colours. Ready in about a minute.', f'demo.html?type={key}', f'<div class="others" aria-label="Other kinds of studio">{others}</div>') + '\n\n' + footer(file) + '\n</body>\n</html>\n'
    (PUB / file).write_text(out)


def leaving_page():
    keep = [
        ('The system', "Your licence is permanent once setup is paid. It keeps working after we've gone."),
        ('Hosting and email', "Accounts in your studio's name, on your own billing. Nothing to move."),
        ('Payments', "Your Stripe account is yours. Cards and Direct Debits stay set up."),
        ('Your apps', "Published under your own Apple and Google accounts, so they stay in the stores."),
        ('Your web address', 'Registered to you.'),
        ('Your data', 'In a database in your own account, not one shared with other studios.'),
        ('The code', "If we stop trading or can't support you for 90 days, you get the full source code, and any developer can look after it for you."),
    ]
    rows = ''.join(f'<li><b>{e(a)}</b><span>{e(b)}</span></li>' for a, b in keep)
    folds = '\n'.join([
        fold('export', 'How to export', "You don't need us for this", '<div class="prose"><p>In the back office, open <b>Import &amp; export</b> and download your clients, memberships, bookings, payments for any dates, and a sales journal for Xero, QuickBooks or Sage with VAT split out.</p>\n    <p>They\'re CSV files: they open in Excel, Numbers and Google Sheets, and other booking systems can import them. For the whole database as one file, ask us, or download it from your Cloudflare account.</p></div>'),
        fold('going', 'When you go', 'What we do', '<div class="prose"><ul><li>Remove our access to your accounts, and confirm it in writing.</li><li>Hand over what we hold for you: logins we set up, your brand files, a copy of your data and an up-to-date handover document, so another developer can take over in a day.</li><li>Delete our own copies once you have everything.</li></ul></div>'),
        fold('care', 'The care plan', 'Stopping it', '<div class="prose"><p>It runs a year at a time. Tell us 30 days before it renews and it stops; there\'s nothing else to cancel. Your system keeps running without it, but without updates or support. If you have your own apps, Apple and Google ask for regular updates, so you\'d need someone to do those.</p></div>'),
    ])
    out = head('Leaving taal: what you keep and how to take it with you',
               "If you stop working with taal, your system, your apps and your data stay yours. Here's what you keep and how to export it.") + nav('leaving.html') + f'''

<header class="head"><div class="wrap">
  <div>
    <h1><span>Leaving taal.</span><span class="tone">It stays yours.</span></h1>
    <p class="lede">Stop working with us whenever you like. Your system keeps running, because it was never ours.</p>
  </div>
  {ART}
</div></header>

<section class="band"><div class="wrap">
  <h2 class="h2">What you keep</h2>
  <ul class="plain" style="margin-top:32px">{rows}</ul>
</div></section>

<div class="folds"><div class="wrap">
{folds}
</div></div>

''' + coda('See your studio in it first.', "We'd rather you knew all this before you start. Ask us anything on the call.", 'demo.html', '<a href="compare.html">Compare three years of costs</a>') + '\n\n' + footer('leaving.html') + '\n</body>\n</html>\n'
    (PUB / 'leaving.html').write_text(out)


def stamp(file):
    """Puts the shared nav and footer into a hand-written inner page."""
    p = PUB / file; s = p.read_text()
    s = re.sub(r'<!--nav-->.*?<!--/nav-->', lambda m: '<!--nav-->' + nav(file) + '<!--/nav-->', s, flags=re.S)
    s = re.sub(r'<!--foot-->.*?<!--/foot-->', lambda m: '<!--foot-->' + footer(file) + '<!--/foot-->', s, flags=re.S)
    p.write_text(s)


if __name__ == '__main__':
    for row in KINDS:
        studio_page(*row)
    leaving_page()
    for old, new in REDIRECTS.items():
        (PUB / old).write_text(f'<!DOCTYPE html>\n<html lang="en-GB"><head><meta charset="utf-8"><title>taal</title><meta name="robots" content="noindex"><link rel="canonical" href="{new}"><meta http-equiv="refresh" content="0; url={new}"></head><body><a href="{new}">Continue</a></body></html>\n')
    for f in ('compare.html', 'privacy.html'):
        if (PUB / f).exists():
            stamp(f)
    print('built', ', '.join(r[0] for r in KINDS))
