"""Guides for studio owners, at /guides. Plain, useful answers to what owners search for.

Run from the repo root:  python3 tools/guides.py   (studio_pages.py runs it too)
Each guide is written below as HTML. Keep prices in step with what each company publishes
and change DATE when a guide is checked again.
"""
import html, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from studio_pages import head as page_head, nav, footer, coda, PUB  # noqa: E402

e = html.escape
OUT = PUB / 'guides'
DATE = ('2026-11-16', '16 November 2026')

# slug, title, short title, description, body
GUIDES = []


def guide(slug, title, short, desc, body):
    GUIDES.append((slug, title, short, desc, body))


guide('booking-software-cost', 'How much does studio booking software cost in the UK?', 'What booking software costs',
      'What UK gyms and studios pay for booking software in 2026: monthly fees, branded apps, card fees and the total over three years, from published prices.',
      '''<p class="answer"><b>The short answer.</b> Most independent UK studios pay between £80 and £180 a month for booking software, before card fees. Add a branded app and it's often £150 to £300 a month. Over three years that's roughly £3,000 to £11,000, and the bill keeps coming for as long as you use it.</p>

<h2>What the main systems charge</h2>
<p>These are the starting prices each company publishes. Most rise with your number of members, locations or features, so treat them as the lowest you'd pay.</p>
<div class="t-wrap"><table>
<thead><tr><th>System</th><th>From, a month</th><th>Your own branded app</th></tr></thead>
<tbody>
<tr><td>ClubRight Core</td><td>£79 plus VAT</td><td>Members use ClubRight's app</td></tr>
<tr><td>ClubRight Complete</td><td>£129 plus VAT</td><td>Members use ClubRight's app</td></tr>
<tr><td>Mindbody Starter</td><td>£89 per location</td><td>Not on Starter; higher plans by quote</td></tr>
<tr><td>TeamUp</td><td>£99, up to 100 active customers, rising with numbers</td><td>£79 a month extra</td></tr>
<tr><td>bsport</td><td>£150</td><td>Included</td></tr>
<tr><td>Momence</td><td>$199 on the plan with no fee on each payment</td><td>$250 a month extra</td></tr>
<tr><td>Glofox</td><td>Quote only</td><td>Quote only</td></tr>
</tbody></table></div>
<p class="small">Prices as published in November 2026. Some are quoted before VAT and some after, so check which when you compare.</p>

<h2>The costs that aren't on the pricing page</h2>
<ul>
<li><b>Card fees.</b> Every system charges for taking payments. Stripe's standard UK rate is 1.5% plus 20p a card payment; some platforms run their own payments and charge more. On £8,000 a month of memberships, half a percent is £480 a year.</li>
<li><b>Growing out of a tier.</b> Prices that rise with active members mean a good year costs you more in software.</li>
<li><b>Add-ons.</b> Branded apps, text messages, marketing tools and extra locations are often priced separately.</li>
<li><b>Contracts and price rises.</b> Check the notice period and how much prices have risen at renewal before.</li>
<li><b>Switching.</b> Moving your members out later can mean paying for a data export. See <a href="/guides/move-from-mindbody">how to move from Mindbody</a>.</li>
</ul>

<h2>Work out your real cost over three years</h2>
<p>Take your last invoice, not the pricing page. Add the monthly fee, any app or add-on fees and VAT if it's charged on top, then multiply by 36. Add a year of card fees for each year. That number is what you're really comparing. A few examples from published prices, before card fees:</p>
<div class="t-wrap"><table>
<thead><tr><th>Three years of</th><th>Total</th></tr></thead>
<tbody>
<tr><td>Mindbody Starter</td><td>£3,204</td></tr>
<tr><td>ClubRight Core, with VAT</td><td>£3,413</td></tr>
<tr><td>TeamUp with its branded app, up to 100 active customers</td><td>£6,408</td></tr>
</tbody></table></div>

<h2>The other way to pay: once</h2>
<p>A newer option is to pay once to have a system built for you, in your own name and accounts, then pay only running costs. With taal, a booking system is £1,900 and your own apps are £1,000 more, or spread over 12 or 24 months. Hosting and email then cost about £30 a month, paid straight to those companies, and an optional care plan costs £30 to £40 a month from year two.</p>
<p>To be straight about it: paying once costs more at the start, and over three years it isn't the cheapest choice if all you need is basic booking. A booking system with your own apps comes to about £5,200 over three years, including hosting, app store fees and the care plan. That's less than TeamUp or Momence with their apps and about the same as bsport, and from year four it's about £920 a year, including Apple's fee. Our <a href="/compare">three-year comparison</a> lets you put in what you pay now.</p>

<h2>What to ask any supplier</h2>
<ul>
<li>What will I pay a month at my member numbers, including VAT?</li>
<li>What do you charge to take a card payment and a Direct Debit?</li>
<li>Is the app in my name, or am I listed in yours?</li>
<li>How long is the contract, and what did prices rise by last year?</li>
<li>If I leave, how do I get my members, memberships and payment details out, and what does it cost?</li>
</ul>''')

guide('move-from-mindbody', 'How to move from Mindbody without losing members', 'Moving from Mindbody',
      'A step-by-step guide to leaving Mindbody: what to export, how to move card details safely, when to tell members and how to switch without double charging anyone.',
      '''<p class="answer"><b>The short answer.</b> Export your clients, memberships, credits and bookings yourself from Mindbody's reports. Decide whether to move card details processor to processor or ask members to add them again. Then switch on one date, with each member's renewal date carried across, and tell members two weeks before.</p>

<h2>1. Check your contract first</h2>
<p>Find your agreement and note the notice period and end date. Plan to go live on the new system just before you stop paying Mindbody, so there's no month with nothing to book on, and no month paying for both.</p>

<h2>2. Export what you can yourself</h2>
<p>Mindbody's own reports can be exported to Excel for free. Menu names change from time to time, but these are the ones to look for under <b>Reports</b>:</p>
<ul>
<li><b>Clients, then Mailing Lists:</b> set the list to all clients and the opt-in status to all clients. This is everyone's name, email and phone.</li>
<li><b>Clients, then Members:</b> who has an active membership, when they joined, what they pay and their next payment date.</li>
<li><b>Clients, then Visits Remaining:</b> class packs and credits, with the option to include expired pricing options ticked.</li>
<li><b>Staff, then Schedule at a Glance:</b> upcoming appointments and bookings.</li>
<li><b>Sales:</b> payment history, for your records and your accountant.</li>
</ul>
<p>If a big export times out, run it for shorter date ranges and join the files.</p>

<h2>3. Decide about card details</h2>
<p>Card numbers never come out in a spreadsheet. You have two choices:</p>
<ul>
<li><b>Processor to processor.</b> Mindbody offers a paid subscriber data export that can pass stored card details securely to your new payment processor. Other software companies report it at around $500 and five working days, varying by region. Stripe's migrations team can receive the data and attach each card to the right member.</li>
<li><b>Members add them again.</b> When members first sign in to the new app, they add a card or set up a Direct Debit. For most small studios this is simpler and costs nothing, as long as you give people a clear date and a reason to do it.</li>
</ul>

<h2>4. Set up memberships to match</h2>
<p>Recreate each membership and pack at the same price, then carry across each member's next payment date and remaining credits. Nobody should pay twice in a month or lose a class they've paid for. Check a handful of members by hand against the export.</p>

<h2>5. Tell members early</h2>
<ul>
<li><b>Two weeks before:</b> say what's changing and when, that their membership and credits come with them, and how to get the new app.</li>
<li><b>A few days before:</b> send the link to sign in with the same email, and ask them to add a card if needed.</li>
<li><b>On the day:</b> a reminder at the desk and on screen, and someone on hand to help.</li>
</ul>

<h2>6. Switch day</h2>
<ul>
<li>Stop Mindbody's automatic payments for the next cycle, so the new system takes the next payment.</li>
<li>Check the timetable, the first bookings and the first payments as they come in.</li>
<li>Keep your exports somewhere safe. You'll want them for your accounts and if anyone queries a payment.</li>
</ul>

<p>If you move to taal, we do the import as part of set-up: members, memberships and credits come across, and we check them with you before you go live.</p>''')

guide('branded-app', 'Do you need your own branded app?', 'Your own branded app',
      'When a studio needs its own app on the App Store and Google Play, what it costs, what it takes, and when booking on the web is enough.',
      '''<p class="answer"><b>The short answer.</b> Not always. If members book once a week and your web booking works well on phones, it may be enough. Your own app earns its place when members book often, you want to reach them with notifications instead of texts, or you want them to scan in at the door and see your name, not a marketplace, on their phone.</p>

<h2>What "your own app" really means</h2>
<p>There are three different things that get called an app:</p>
<ul>
<li><b>A listing in someone else's app.</b> Your timetable appears inside a marketplace app, next to other studios nearby. Good for being found, but members see your competitors every time they book.</li>
<li><b>The software company's member app.</b> Members download the supplier's app and pick your studio inside it.</li>
<li><b>Your own app.</b> Your name and logo on the App Store, Google Play and members' home screens, with nobody else in it.</li>
</ul>
<p>Ask any supplier which of the three you're getting, and whose name it's published under.</p>

<h2>What your own app is good for</h2>
<ul>
<li><b>Notifications.</b> A waitlist space, a class change or a renewal reminder reaches members straight away, and costs nothing to send, unlike texts.</li>
<li><b>Faster booking.</b> Members stay signed in, so booking takes seconds.</li>
<li><b>Entry at the door.</b> A QR code in the app replaces fobs and cards.</li>
<li><b>Your brand.</b> Your name on their home screen, every day.</li>
</ul>

<h2>What it costs and takes</h2>
<ul>
<li><b>App store accounts.</b> Apple's developer programme is £79 a year. Google Play has a one-off fee of $25.</li>
<li><b>Proof of your business.</b> To publish in your company's name, Apple asks for a D-U-N-S number. It's free, and Apple says to allow up to five working days for a new one. Sole traders usually enrol as individuals instead, so the app shows the owner's own name as the seller.</li>
<li><b>Updates.</b> Apple and Google change their rules every year, and apps that aren't kept up to date get removed. Someone has to look after it.</li>
<li><b>The app itself.</b> Branded apps are usually a monthly add-on: TeamUp's is £79 a month and Momence's is $250. With taal it's £1,000 once, published under your own accounts.</li>
</ul>

<h2>Four questions to decide</h2>
<ul>
<li>Do most members book more than once a week?</li>
<li>Do you run waitlists, or classes that fill up?</li>
<li>Would you rather send a free notification than pay for a text?</li>
<li>Do you want members to scan in at the door?</li>
</ul>
<p>Two or more yeses and your own app will probably pay for itself. If not, start with good web booking and add the app later.</p>
<p>You can <a href="/demo">build a demo of your own app</a> in about a minute to see what members would get.</p>''')

SOURCES = {
    'booking-software-cost': [
        ('ClubRight: Core and Complete prices', 'https://help.clubright.co.uk/en/articles/6205565-upgrade-from-core-to-complete'),
        ('Mindbody: UK pricing', 'https://www.mindbodyonline.com/business/education/blog/mindbody-pricing-united-kingdom'),
        ('TeamUp: pricing', 'https://goteamup.com/pricing'),
        ('Stripe: UK pricing', 'https://stripe.com/gb/pricing'),
        ('taal: three years side by side', 'https://taal.solutions/compare'),
    ],
    'move-from-mindbody': [
        ('Gymdesk: exporting from Mindbody', 'https://docs.gymdesk.com/en/help/docs/mindbodyexports'),
        ('Arbox: export data from Mindbody', 'https://help.arboxapp.com/en/articles/5320232-export-data-from-mindbody'),
        ('Spark Membership: Mindbody paid and free exports', 'https://help.sparkmembership.com/en/articles/5124676-exporting-from-mindbody'),
        ('Stripe: import payment data from another processor', 'https://docs.stripe.com/get-started/data-migrations/pan-import'),
    ],
    'branded-app': [
        ('Apple: D-U-N-S Number', 'https://developer.apple.com/support/d-u-n-s/'),
        ('Apple Developer Program fee in the UK', 'https://support.eazi-business.com/article/547-organisation-developer-accounts'),
        ('taal: three years side by side, with app prices', 'https://taal.solutions/compare'),
    ],
}

CSS = '''<style>
.article { max-width:700px; padding:64px 0 96px; }
.article .crumb { font-size:14px; color:var(--mute); margin:0 0 18px; }
.article .crumb a { color:inherit; }
.article h1 { font-size:clamp(36px, 5.2vw, 60px); line-height:1; letter-spacing:-0.04em; }
.article .meta { color:var(--mute); font-size:14px; margin:18px 0 32px; }
.article h2 { font-size:clamp(24px, 2.6vw, 30px); letter-spacing:-0.02em; margin:44px 0 12px; }
.article p, .article li { color:#33403D; font-size:17px; line-height:1.6; }
.article p { margin:0 0 14px; }
.article ul { padding-left:20px; margin:0 0 14px; }
.article li { margin:6px 0; }
.article a { color:var(--green); }
.article .answer { background:#fff; border-radius:16px; padding:20px 22px; font-size:18px; color:var(--ink); }
.article .small { font-size:14px; color:var(--mute); }
.t-wrap { overflow-x:auto; margin:6px 0 10px; }
.article table { width:100%; border-collapse:collapse; font-size:15px; }
.article th, .article td { text-align:left; padding:10px 12px 10px 0; border-bottom:1px solid var(--rule); vertical-align:top; }
.article thead th { font-size:13px; color:var(--mute); font-weight:600; border-bottom:2px solid var(--ink); }
.article .sources { margin-top:48px; padding-top:18px; border-top:1px solid var(--rule); }
.article .sources h2 { font-size:18px; margin:0 0 8px; }
.article .sources li { font-size:14px; }
.article .g-list { list-style:none; padding:0; margin:28px 0 0; border-top:2px solid var(--ink); }
.g-list li { padding:22px 0; border-bottom:1px solid var(--rule); }
.g-list a { display:block; line-height:1.15; font-family:'Funnel Display', sans-serif; font-weight:650; font-size:24px; letter-spacing:-0.02em; color:var(--ink); text-decoration:none; }
.g-list a:hover { color:var(--green); }
.g-list p { margin:6px 0 0; color:var(--mute); font-size:16px; }
</style>'''


def head(title, desc):
    h = page_head(title, desc).replace('href="fonts/', 'href="/fonts/').replace('href="page.css"', 'href="/page.css"')
    return h.replace('</head>', CSS + '\n</head>')


def tail():
    return coda('See your studio in it first.', 'Build a working demo of your own app in about a minute, then book a call.', 'demo.html',
                '<a href="compare.html">Compare three years of costs</a>') + '\n\n' + footer() + '\n</body>\n</html>\n'


def main():
    OUT.mkdir(exist_ok=True)
    for slug, title, short, desc, body in GUIDES:
        src = ''.join(f'<li><a href="{u}">{e(t)}</a></li>' for t, u in SOURCES.get(slug, []))
        page = head(title + ': taal', desc) + nav() + f'''
<main class="wrap"><article class="article">
  <p class="crumb"><a href="/guides/">Guides</a></p>
  <h1>{e(title)}</h1>
  <p class="meta">By Tim Allan, founder of taal, who ran a wellness studio in London for seven years. Updated <time datetime="{DATE[0]}">{DATE[1]}</time>.</p>
  {body}
  {f'<div class="sources"><h2>Sources</h2><ul>{src}</ul></div>' if src else ''}
</article></main>

''' + tail()
        (OUT / f'{slug}.html').write_text(page)
    items = ''.join(f'<li><a href="/guides/{s}">{e(t)}</a><p>{e(d)}</p></li>' for s, t, _, d, _ in GUIDES)
    index = head('Guides for studio owners: taal', 'Plain answers for independent gyms and studios: what booking software costs, how to switch systems and whether you need your own app.') + nav() + f'''
<main class="wrap"><article class="article">
  <h1>Guides for studio owners</h1>
  <p class="meta">Plain answers to the questions we hear most, from someone who ran a studio for seven years.</p>
  <ul class="g-list">{items}</ul>
</article></main>

''' + tail()
    (OUT / 'index.html').write_text(index)
    print('guides:', ', '.join(g[0] for g in GUIDES))


if __name__ == '__main__':
    main()
