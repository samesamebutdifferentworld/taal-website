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

MARK = ('<svg width="{s}" height="{s}" viewBox="0 0 24 24" aria-hidden="true">'
        '<rect x="2.5" y="4" width="3" height="16" rx="1.5" fill="#A8382B"/>'
        '<rect x="8.5" y="7" width="3" height="10" rx="1.5" fill="#0F5C57"/>'
        '<circle cx="15.5" cy="12" r="2.1" fill="none" stroke="#13201E" stroke-width="1.6"/>'
        '<rect x="19.5" y="7" width="3" height="10" rx="1.5" fill="#0F5C57"/></svg>')

FAVICON = ("data:image/svg+xml,%3Csvg width='64' height='64' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E"
           "%3Crect width='24' height='24' rx='5.76' fill='%230F5C57'/%3E%3Cg transform='translate(3.5 3.5) scale(0.7083)'%3E"
           "%3Crect x='2.5' y='4' width='3' height='16' rx='1.5' fill='%23E59A8C'/%3E%3Crect x='8.5' y='7' width='3' height='10' rx='1.5' fill='%23F2F3EE'/%3E"
           "%3Ccircle cx='15.5' cy='12' r='2.1' fill='none' stroke='%23F2F3EE' stroke-width='1.8'/%3E"
           "%3Crect x='19.5' y='7' width='3' height='10' rx='1.5' fill='%23F2F3EE'/%3E%3C/g%3E%3C/svg%3E")

# file, key in T, menu label, how the page names the studio, the team, the sample brand
KINDS = [
    ('gyms.html', 'fitness', 'Gyms', 'your gym', 'coaches', ('Forge', '#24365C')),
    ('wellness.html', 'wellness', 'Wellness', 'your wellness studio', 'therapists', ('Haven', '#155E5A')),
    ('yoga.html', 'yoga', 'Yoga', 'your yoga studio', 'teachers', ('Still', '#5E2C4E')),
    ('pilates.html', 'pilates', 'Pilates', 'your Pilates studio', 'instructors', ('Line', '#4D5A2C')),
]

e = html.escape


def nav(current=''):
    items = [('compare.html', 'Compare costs'), ('index.html#pricing', 'Pricing'), ('leaving.html', 'Leaving taal')]
    lis = ''.join(f'<li><a href="{h}"{" aria-current=\"page\"" if h == current else ""}>{t}</a></li>' for h, t in items)
    return (f'<nav><div class="wrap">\n  <a class="logo" href="index.html" aria-label="taal home">{MARK.format(s=24)}taal</a>\n'
            f'  <ul>{lis}</ul>\n  <a class="btn btn-seal" href="demo.html">Build your demo</a>\n</div></nav>')


def footer(current=''):
    links = [(f, label) for f, _, label, *_ in KINDS] + [('compare.html', 'Compare costs'), ('leaving.html', 'Leaving taal'), ('privacy.html', 'Privacy')]
    a = ''.join(f'<a href="{h}"{" aria-current=\"page\"" if h == current else ""}>{t}</a>' for h, t in links)
    return (f'<footer><div class="wrap">\n  <a class="logo" href="index.html" aria-label="taal home">{MARK.format(s=20)}taal</a>\n'
            '  <p>Studio software made in London for independent gyms and wellness studios.</p>\n'
            f'  <div class="links">{a}<a class="mail" href="mailto:EMAIL">Contact</a></div>\n</div></footer>\n'
            "<script>(function () { const EMAIL = 'EMAIL'; if (!EMAIL.includes('@')) return; document.querySelectorAll('a.mail').forEach(a => { a.href = 'mailto:' + EMAIL; }); })();</script>")


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


def studio_page(file, key, label, studio, team, brand):
    k = T[key]; c = k['copy']
    people = c['people']
    plural = studio.replace('your ', '') + 's'
    title = f'Booking app for {plural}: taal'
    desc = f"Your own booking app for {plural}, in your brand. {c['show1']} Pay once from £1,900, with no monthly fee to us."
    others = ''.join(f'<a href="{f}"{" aria-current=\"page\"" if f == file else ""}>{l}</a>' for f, _, l, *_ in KINDS)
    out = head(title, desc) + nav() + f'''

<header class="head"><div class="wrap split">
  <div>
    <h1>Your own booking app. <span class="tone br">For {studio}.</span></h1>
    <p class="lede">{e(c['show1'])} All from an app with your studio's name on it, on your {people}' phones. Pay once from £1,900, with no monthly fee to us.</p>
    <div class="go"><a class="btn btn-seal" href="demo.html?type={key}">Try your free demo</a><span>Ready in about a minute, with just your email</span></div>
  </div>
  <div class="phone-wrap">
    {phone(k, *brand)}
  </div>
</div></header>

<section class="band"><div class="wrap">
  <h2>What your {people} get</h2>
  <p class="sub">An app in the App Store and Google Play under your name, with reminders and alerts when a space opens.</p>
  {cols([(c['f1h'], c['f1']), (c['f2h'], c['f2']), (c['f3h'], c['f3']), (c['f4h'], c['f4'])], ' four')}
</div></section>

<section class="band"><div class="wrap">
  <h2>What your {team} get</h2>
  {cols([(c['show3h'], c['show3']), (c['t3h'], c['t3']), (c['t4h'], c['t4'])])}
</div></section>

<section class="band"><div class="wrap">
  <h2>What you get</h2>
  <p class="sub">Bookings, payments, the timetable, the rota, cover, staff pay and messages, in one system your whole team uses.</p>
  {cols([(c['s1h'], c['s1']), (c['show2h'], c['show2']), (c['s3h'], c['s3']), ('Moving across', c['s6'])], ' four')}
</div></section>

<section class="band"><div class="wrap">
  <h2>One price, then it's yours</h2>
  <div class="price-strip">
    <div><b>£1,900</b><span>Once, for the booking system</span></div>
    <div><b>£2,900</b><span>With your own apps</span></div>
    <div><b>£30</b><span>A month for hosting and email, paid to those companies, not to us</span></div>
  </div>
  <p class="note" style="margin-top:18px">Prices include VAT. The care plan after year one is optional, at £300 a year.</p>
  <div class="links-row"><a href="compare.html">Compare three years of costs</a><a href="index.html#pricing">Build your price</a><a href="leaving.html">What you keep if you leave</a></div>
</div></section>

<section class="close"><div class="wrap">
  <h2>See {studio} in it first.</h2>
  <p>A working version of your app, with your name and colours. It takes about a minute and stays live for 30 days.</p>
  <div class="go"><a class="btn btn-seal" href="demo.html?type={key}">Try your free demo</a></div>
  <div class="others" aria-label="Other kinds of studio">{others}</div>
</div></section>

''' + footer(file) + '\n</body>\n</html>\n'
    (PUB / file).write_text(out)


def stamp(file):
    """Puts the shared nav and footer into a hand-written inner page."""
    p = PUB / file; s = p.read_text()
    s = re.sub(r'<!--nav-->.*?<!--/nav-->', lambda m: '<!--nav-->' + nav(file) + '<!--/nav-->', s, flags=re.S)
    s = re.sub(r'<!--foot-->.*?<!--/foot-->', lambda m: '<!--foot-->' + footer(file) + '<!--/foot-->', s, flags=re.S)
    p.write_text(s)


if __name__ == '__main__':
    for row in KINDS:
        studio_page(*row)
    for f in ('compare.html', 'leaving.html'):
        if (PUB / f).exists():
            stamp(f)
    print('built', ', '.join(r[0] for r in KINDS))
