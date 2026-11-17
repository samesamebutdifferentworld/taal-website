"""Search and AI-search housekeeping for the site in ./public.

- Links between pages use clean addresses (/gyms, not gyms.html), so nothing
  goes through a redirect.
- Every page gets a canonical address, Open Graph basics and structured data
  (JSON-LD) that search engines and AI assistants read.
- Writes sitemap.xml, robots.txt (which welcomes search and AI crawlers) and
  llms.txt (a plain summary of taal for AI assistants).
- The icon is a real file (/favicon.svg), which Google needs to show it in results.

Runs at the end of tools/studio_pages.py, or on its own:  python3 tools/seo.py
Safe to run again: it replaces what it wrote last time.
"""
import html, json, re, subprocess
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / 'public'
SITE = 'https://taal.solutions'

# Pages people should find, in sitemap order: file, clean address, priority.
PAGES = [
    ('index.html', '/', '1.0'),
    ('gyms.html', '/gyms', '0.8'),
    ('wellness.html', '/wellness', '0.8'),
    ('yoga-pilates.html', '/yoga-pilates', '0.8'),
    ('dance.html', '/dance', '0.8'),
    ('martial-arts.html', '/martial-arts', '0.8'),
    ('climbing.html', '/climbing', '0.8'),
    ('compare.html', '/compare', '0.7'),
    ('demo.html', '/demo', '0.7'),
    ('leaving.html', '/leaving', '0.5'),
    ('guides/index.html', '/guides/', '0.6'),
    ('guides/booking-software-cost.html', '/guides/booking-software-cost', '0.6'),
    ('guides/move-from-mindbody.html', '/guides/move-from-mindbody', '0.6'),
    ('guides/branded-app.html', '/guides/branded-app', '0.6'),
]
STUDIO = {
    'gyms.html': ('Gyms', 'gyms'),
    'wellness.html': ('Wellness', 'wellness studios'),
    'yoga-pilates.html': ('Yoga and Pilates', 'yoga and Pilates studios'),
    'dance.html': ('Dance', 'dance studios'),
    'martial-arts.html': ('Martial arts', 'martial arts clubs'),
    'climbing.html': ('Climbing', 'climbing walls'),
}
# Titles for the hand-written pages (the studio pages get theirs from studio_pages.py).
TITLES = {
    'index.html': 'taal: booking software and your own app for independent gyms and studios',
    'compare.html': 'taal vs Mindbody, TeamUp and ClubRight: three years of costs',
}
# Crawlers welcomed by name in robots.txt: search engines and AI assistants.
BOTS = ['Googlebot', 'Bingbot', 'Applebot', 'DuckDuckBot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
        'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User',
        'Google-Extended', 'Applebot-Extended', 'CCBot', 'Amazonbot', 'meta-externalagent', 'MistralAI-User']

FAVICON_SVG = ('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24">'
               '<rect width="24" height="24" rx="5.76" fill="#0F5C57"/><g transform="translate(3.5 3.5) scale(0.7083)">'
               '<rect x="2.5" y="4" width="3" height="16" rx="1.5" fill="#E59A8C"/>'
               '<rect x="8.5" y="7" width="3" height="10" rx="1.5" fill="#F2F3EE"/>'
               '<circle cx="15.5" cy="12" r="2.1" fill="none" stroke="#F2F3EE" stroke-width="1.8"/>'
               '<rect x="19.5" y="7" width="3" height="10" rx="1.5" fill="#F2F3EE"/></g></svg>\n')

FILES = {f for f, *_ in PAGES} | {'privacy.html', 'yoga.html', 'pilates.html'}
CLEAN = {f: p for f, p, _ in PAGES} | {'privacy.html': '/privacy', 'yoga.html': '/yoga-pilates', 'pilates.html': '/yoga-pilates'}


def text(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s)).strip()


def meta(s, name):
    m = re.search(rf'<meta (?:name|property)="{re.escape(name)}" content="([^"]*)"', s)
    return html.unescape(m.group(1)) if m else ''


def clean_links(s):
    """href="gyms.html#x" becomes href="/gyms#x"; index.html becomes /."""
    def sub(m):
        f, rest = m.group(1) + '.html', m.group(2) or ''
        if f not in CLEAN:
            return m.group(0)
        return f'href="{CLEAN[f]}{rest}"'
    s = re.sub(r'href="(?:\./)?([a-z-]+)\.html([?#][^"]*)?"', sub, s)
    return s.replace('href="./"', 'href="/"')


def faqs(index_html):
    return [(text(q), text(a)) for q, a in re.findall(r'<details><summary>(.*?)</summary><p>(.*?)</p></details>', index_html, re.S)]


def prices(index_html):
    """The once and plan prices from the pricing builder, so llms.txt and structured data never drift."""
    out = {}
    for key, once, s1, m1, s2, m2 in re.findall(r"(base|apps|site): \{ once: (\d+), spread: \{ start: (\d+), monthly: (\d+) \}, spread24: \{ start: (\d+), monthly: (\d+) \} \}", index_html):
        out[key] = dict(once=int(once), m12=(int(s1), int(m1)), m24=(int(s2), int(m2)))
    care = re.search(r'CARE = \{ base: (\d+), apps: (\d+) \}', index_html)
    out['care'] = (int(care.group(1)), int(care.group(2))) if care else (30, 40)
    assert {'base', 'apps', 'site'} <= set(out), 'prices not found in index.html'
    return out


def ld(obj):
    return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/') + '</script>'


ORG = {'@type': 'Organization', '@id': SITE + '/#org', 'name': 'taal', 'url': SITE + '/', 'logo': SITE + '/icon-512.png',
       'email': 'hello@taal.solutions', 'areaServed': 'GB',
       'description': 'taal builds booking software and branded member apps for independent gyms, studios and clubs in the UK.',
       'founder': {'@type': 'Person', 'name': 'Tim Allan', 'jobTitle': 'Founder',
                   'description': 'Ran yue float, a wellness studio in South West London, for seven years.'}}


def offers(P):
    names = {'base': 'Booking system: web booking, payments and back office', 'apps': 'Your own apps on the App Store and Google Play', 'site': 'Studio website with live timetable'}
    return [{'@type': 'Offer', 'name': names[k], 'price': P[k]['once'], 'priceCurrency': 'GBP',
             'priceSpecification': {'@type': 'PriceSpecification', 'price': P[k]['once'], 'priceCurrency': 'GBP', 'valueAddedTaxIncluded': True},
             'description': f"One-off set-up, or £{P[k]['m12'][0]:,} then £{P[k]['m12'][1]} a month for 12 months, or £{P[k]['m24'][0]:,} then £{P[k]['m24'][1]} a month for 24 months."}
            for k in ('base', 'apps', 'site')]


def crumbs(name, path):
    return {'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'taal', 'item': SITE + '/'},
        {'@type': 'ListItem', 'position': 2, 'name': name, 'item': SITE + path}]}


def graph(file, path, s, index_html, P):
    title, desc = text(re.search(r'<title>(.*?)</title>', s, re.S).group(1)), meta(s, 'description')
    page = {'@type': 'WebPage', '@id': SITE + path + '#page', 'url': SITE + path, 'name': title, 'description': desc,
            'inLanguage': 'en-GB', 'isPartOf': {'@id': SITE + '/#website'}, 'publisher': {'@id': SITE + '/#org'}}
    if file == 'index.html':
        app = {'@type': 'SoftwareApplication', '@id': SITE + '/#app', 'name': 'taal', 'url': SITE + '/',
               'applicationCategory': 'BusinessApplication', 'applicationSubCategory': 'Booking, membership and studio management software',
               'operatingSystem': 'Web, iOS, Android', 'description': desc, 'publisher': {'@id': SITE + '/#org'},
               'audience': {'@type': 'BusinessAudience', 'audienceType': 'Independent gyms, fitness, wellness, yoga, Pilates, dance, martial arts and climbing studios'},
               'featureList': ['Class and appointment booking', 'Memberships, class packs and credits', 'Card and Direct Debit payments through Stripe',
                               'Waitlists with instant alerts', 'QR code entry', 'Member messaging', 'Branded iOS and Android apps', 'Back office for owners and coaches',
                               'Moving members across from Mindbody, Glofox, TeamUp or ClubRight'],
               'offers': offers(P)}
        faq = {'@type': 'FAQPage', '@id': SITE + '/#faq', 'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in faqs(index_html)]}
        site = {'@type': 'WebSite', '@id': SITE + '/#website', 'url': SITE + '/', 'name': 'taal', 'inLanguage': 'en-GB', 'publisher': {'@id': SITE + '/#org'}}
        page['about'] = {'@id': SITE + '/#app'}
        return [ORG, site, page, app, faq]
    if file in STUDIO:
        label, plural = STUDIO[file]
        service = {'@type': 'Service', '@id': SITE + path + '#service', 'name': f'Booking software and branded app for {plural}',
                   'serviceType': 'Booking and membership software', 'provider': {'@id': SITE + '/#org'}, 'areaServed': 'GB',
                   'audience': {'@type': 'BusinessAudience', 'audienceType': plural[0].upper() + plural[1:]},
                   'description': desc, 'offers': offers(P)}
        page['about'] = {'@id': SITE + path + '#service'}
        return [page, service, crumbs(label, path)]
    if file.startswith('guides/'):
        if file == 'guides/index.html':
            return [page, crumbs('Guides', path)]
        art = {'@type': 'Article', '@id': SITE + path + '#article', 'headline': title.replace(': taal', ''), 'description': desc,
               'inLanguage': 'en-GB', 'mainEntityOfPage': {'@id': SITE + path + '#page'},
               'author': {'@type': 'Person', 'name': 'Tim Allan', 'jobTitle': 'Founder, taal'}, 'publisher': {'@id': SITE + '/#org'},
               'datePublished': re.search(r'datetime="([^"]+)"', s).group(1), 'dateModified': re.search(r'datetime="([^"]+)"', s).group(1)}
        bc = {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'taal', 'item': SITE + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Guides', 'item': SITE + '/guides/'},
            {'@type': 'ListItem', 'position': 3, 'name': title.replace(': taal', ''), 'item': SITE + path}]}
        return [page, art, bc, ORG]
    names = {'compare.html': 'Compare costs', 'demo.html': 'Build your demo', 'leaving.html': 'Leaving taal', 'privacy.html': 'Privacy'}
    return [page, crumbs(names.get(file, title), path)]


def head_block(file, path, s, index_html, P):
    title, desc = text(re.search(r'<title>(.*?)</title>', s, re.S).group(1)), meta(s, 'description')
    tags = [f'<link rel="canonical" href="{SITE}{path}">', f'<meta property="og:url" content="{SITE}{path}">',
            '<meta property="og:type" content="website">', '<meta property="og:site_name" content="taal">', '<meta property="og:locale" content="en_GB">',
            '<link rel="icon" href="/favicon.svg" type="image/svg+xml">', '<link rel="apple-touch-icon" href="/apple-touch-icon.png">']
    if not meta(s, 'og:title'):
        tags.append(f'<meta property="og:title" content="{html.escape(title)}">')
    if not meta(s, 'og:description'):
        tags.append(f'<meta property="og:description" content="{html.escape(desc)}">')
    tags.append(ld({'@context': 'https://schema.org', '@graph': graph(file, path, s, index_html, P)}))
    return '<!--seo-->\n' + '\n'.join(tags) + '\n<!--/seo-->\n'


def set_title(s, title):
    t = html.escape(title, quote=False)
    s = re.sub(r'<title>.*?</title>', f'<title>{t}</title>', s, count=1, flags=re.S)
    return re.sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{html.escape(title)}">', s, count=1)


def lastmod(file):
    try:
        out = subprocess.check_output(['git', '-C', str(ROOT), 'log', '-1', '--format=%cs', '--', f'public/{file}'], text=True).strip()
        dirty = subprocess.check_output(['git', '-C', str(ROOT), 'status', '--porcelain', '--', f'public/{file}'], text=True).strip()
        return date.today().isoformat() if dirty or not out else out
    except Exception:
        return date.today().isoformat()


def llms(index_html, P):
    b, a, w = P['base'], P['apps'], P['site']
    care0, care1 = P['care']
    q = '\n\n'.join(f'### {qq}\n\n{aa}' for qq, aa in faqs(index_html))
    return f"""# taal

> taal builds booking software and a branded member app for independent gyms, studios and clubs in the UK. Each studio gets its own system in its own name and accounts: web booking, memberships, payments, a back office for owners and coaches, and its own apps on the App Store and Google Play. Studios pay once to set it up, or spread it over 12 or 24 months, instead of a monthly software subscription. It replaces the likes of Mindbody, Glofox, TeamUp and ClubRight.

taal is run by Tim Allan, who ran yue float, a wellness studio in South West London, for seven years. Website: {SITE}. Email: hello@taal.solutions.

## Who it's for

Independent gyms, wellness studios, yoga and Pilates studios, dance studios, martial arts clubs and climbing walls, with up to about 2,000 active clients. Larger studios get a quote.

## What studios get

- Members book classes, appointments, courses and open gym sessions in an app with the studio's name, logo and colours.
- Memberships, class packs, credits, peak and off-peak plans and gift cards, paid by card or Direct Debit through the studio's own Stripe account.
- Waitlists that alert members the moment a space opens, QR code entry at the door, and messages between members and the studio.
- A back office for owners and a diary for coaches and therapists, with permissions for each.
- Members, memberships and credits moved across from the studio's current system as part of set-up.
- Hosting, email and app store accounts in the studio's own name and billing, so the studio owns its system and data. The licence is permanent.

## Prices (UK, including VAT)

| Part | Pay once | Over 12 months | Over 24 months |
| --- | --- | --- | --- |
| Booking system (web booking, payments, back office) | £{b['once']:,} | £{b['m12'][0]} then £{b['m12'][1]} a month | £{b['m24'][0]} then £{b['m24'][1]} a month |
| Your own apps (App Store and Google Play) | £{a['once']:,} | £{a['m12'][0]} then £{a['m12'][1]} a month | £{a['m24'][0]} then £{a['m24'][1]} a month |
| Studio website with live timetable | £{w['once']:,} | £{w['m12'][0]} then £{w['m12'][1]} a month | £{w['m24'][0]} then £{w['m24'][1]} a month |

- Paying once is in two parts: half on signing and half at go-live.
- Set-up includes 12 months of updates and support. From year two an optional care plan costs £{care0} a month, or £{care1} a month with the studio's own apps.
- Hosting and email cost about £30 a month (about £1 a day), paid by the studio straight to those companies, on top of taal's fees. Stripe charges its standard card fees; taal adds nothing.
- The first three studios get 30% off set-up.

## How it works

1. Build a free demo of your own app at {SITE}/demo in about a minute, with just a first name and email.
2. Book a call. taal builds the system around your timetable, prices and team, ready for you and your staff to try in about four weeks.
3. Go live when your current contract ends. Your own apps follow a few weeks later.

## Pages

- [Home and pricing]({SITE}/): what taal is, the pricing builder and questions
- [Build your demo]({SITE}/demo): a private working demo in your studio's brand
- [Compare costs]({SITE}/compare): three years of taal against Mindbody, TeamUp, ClubRight and others, from published UK prices
- [Leaving taal]({SITE}/leaving): what you keep and how to export your data
- [Guide: how much studio booking software costs in the UK]({SITE}/guides/booking-software-cost)
- [Guide: how to move from Mindbody without losing members]({SITE}/guides/move-from-mindbody)
- [Guide: do you need your own branded app?]({SITE}/guides/branded-app)
- [Gyms]({SITE}/gyms), [Wellness]({SITE}/wellness), [Yoga and Pilates]({SITE}/yoga-pilates), [Dance]({SITE}/dance), [Martial arts]({SITE}/martial-arts), [Climbing]({SITE}/climbing)

## Questions

{q}
"""


def main():
    index_html = (PUB / 'index.html').read_text()
    P = prices(index_html)
    for f in sorted([p.name for p in PUB.glob('*.html')] + ['guides/' + p.name for p in (PUB / 'guides').glob('*.html')]):
        if f == 'admin.html':
            continue
        p = PUB / f
        s = clean_links(p.read_text())
        if f in TITLES:
            s = set_title(s, TITLES[f])
        s = re.sub(r'<link rel="icon" href="data:image/svg\+xml[^"]*">\n?', '', s)
        s = re.sub(r'<!--seo-->.*?<!--/seo-->\n?', '', s, flags=re.S)
        path = CLEAN.get(f)
        if f in ('yoga.html', 'pilates.html'):
            s = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{SITE}/yoga-pilates">', s)
            s = s.replace('url=yoga-pilates.html', 'url=/yoga-pilates')
        elif path:
            s = s.replace('</head>', head_block(f, path, s, index_html if f != 'index.html' else s, P) + '</head>', 1)
        p.write_text(s)
    (PUB / 'favicon.svg').write_text(FAVICON_SVG)
    urls = '\n'.join(f'  <url><loc>{SITE}{path}</loc><lastmod>{lastmod(f)}</lastmod><priority>{pr}</priority></url>' for f, path, pr in PAGES)
    (PUB / 'sitemap.xml').write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n')
    rules = 'Allow: /\nDisallow: /admin.html\nDisallow: /admin\nDisallow: /api/\nDisallow: /client/\nDisallow: /agreement/\nDisallow: /setup/\n'
    named = ''.join(f'User-agent: {b}\n' for b in BOTS)
    (PUB / 'robots.txt').write_text(f'# Search engines and AI assistants are welcome to read and cite this site.\n{named}{rules}\nUser-agent: *\n{rules}\nSitemap: {SITE}/sitemap.xml\n')
    (PUB / 'llms.txt').write_text(llms((PUB / 'index.html').read_text(), P))
    print('seo: links, canonicals, structured data, sitemap.xml, robots.txt, llms.txt')


if __name__ == '__main__':
    main()
