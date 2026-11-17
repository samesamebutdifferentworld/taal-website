# Taal website

Static marketing site for Taal. Files live in `public/`; deployed to Cloudflare Workers (static assets) via `wrangler.jsonc`.

## Licence service

`src/worker.js` also answers `GET /api/licence` for client studios' booking systems
(see the booking repo's README, "Licence"). Licences are entries in the
`taal-licences` KV namespace: key = the studio's licence key, value =
`{"studio":"Name","status":"active"}`. Licences are permanent once setup is paid. Only if a
setup payment is more than 30 days overdue, change it to
`{"studio":"Name","status":"ended","ended_at":"YYYY-MM-DD"}`: the studio sees a notice for 30 days, then the
system goes read-only until you set it back to active. A missing or deleted entry never locks a studio out. Edit them in the Cloudflare dashboard under Storage & databases → KV.

## The demo builder

`/demo.html` lets a studio build its own demo: type of studio, name, colours, lettering, logo and
class names. `/api/build` asks the booking app to build it through the `BOOKING` service binding
(the booking Worker's `DemoBuilder` entrypoint, which can't be reached from the internet), then:

- saves the studio as a lead in the `ENQUIRIES` KV namespace (deleted after a year),
- emails them the links to their app and back office, with a prompt to book a call,
- emails you at `CONTACT_EMAIL`.

Each demo has a private web address with a random ending, shows "Book a call" in its demo bar
(to `CALL_URL`, or back to the call section of `/demo.html`) and is deleted by the booking app
after 30 days. Limits: three demos an hour per connection and three a day per email address.

## Arrange a call

The pricing section's "Arrange a call" button opens a short form (name, studio, email, optional phone
and note) that also sends what they picked in the price builder. `POST /api/call` saves it as a lead,
emails the studio a link to book a time (`CALL_URL`) or asks them to reply with times, and emails
`CONTACT_EMAIL`. Limits: three an hour per connection and three a day per email address, separate from
the demo limits.

## Partners

Each sales partner gets a link: `taal.solutions/r/<code>` (2 to 30 letters, numbers or dashes, e.g.
`taal.solutions/r/sam`). It goes to the home page as `/?ref=sam`, and the worker adds the code to every
link on the page, so it follows the studio around the site without cookies or storage. The code is
saved with any demo they build and passed to Cal.com as `metadata[ref]`, so calls they book carry it too.
The admin page shows each lead's partner and a count of demos and calls per partner.

## Cal.com bookings

Bookings of the "Call with Tim" event reach `POST /api/cal` through a Cal.com webhook (Booking created,
rescheduled and cancelled), signed with the webhook's secret, which is set in Cloudflare as
`CAL_WEBHOOK_SECRET`. Without the secret the address refuses everything.

## Follow-up

Every morning (cron `17 8 * * *`) studios who built a demo 3 to 10 days ago get one short email asking
if they'd like a call, with the booking link filled in. Anyone who has booked or asked for a call is
skipped. Each demo is followed up once.

`/admin.html` lists everyone who built a demo (with links while it lasts), asked for a call or booked one
(with the time, what they picked and the partner, if any). Sign in with `ADMIN_KEY`.

Setup, in Cloudflare (Worker > Settings > Variables and secrets):
- Secrets: `RESEND_API_KEY`, `ADMIN_KEY`.
- In `wrangler.jsonc`: `CONTACT_EMAIL`, `EMAIL_FROM` (a domain verified in Resend), `CALL_URL`.

Without an email key, demos still build and the page shows the links on screen.

Tests: `node --test test/*.test.mjs`

## From call to go-live (src/clients.js)

1. **After a booked call**, about an hour after it starts, the studio gets a summary email with the overview PDF (`public/taal-overview.pdf`, from `tools/overview.py`), then a nudge 5 days later and a last one at 12, unless they're offered an agreement or marked "not going ahead". Open the lead in admin to add a personal note to the summary or hold it.
2. **New agreement** (admin) makes the studio's private portal, `taal.solutions/client/<token>`, and emails the link.
3. **They sign in the portal**: legal name, address, care plan, typed signature. The exact text they signed is kept with a SHA-256 fingerprint, their IP and the time (`/agreement/<token>` prints it). The first invoice goes out (Stripe, if `STRIPE_SECRET_KEY` is set; otherwise it's listed in admin to send by hand) and they get the welcome email. You countersign in admin.
4. **They upload their details** in the portal (saves as they type): brand, photos, classes, timetable, treatments, prices, team, website copy, member export. Reminders go 3 and 8 days after signing if nothing's sent.
5. **They set up their accounts** with the guides at `/setup/` (`tools/setup_guides.py`; add screenshots as `public/img/setup/<guide>-<step>.png`).
6. **Build demo from their details** (admin) calls the booking app's `DemoBuilder.createFromBrief`. Change anything by hand, then **Send for review**. They approve or ask for changes in the portal.
7. **Mark live** sends the second half invoice, or the Direct Debit link for monthly plans (stops itself after the agreed payments), and the care plan Direct Debit if they chose it.

The agreement's words are in `src/agreement.js`; prices in `src/prices.js` (keep in step with the website). Stripe webhook: `https://taal.solutions/api/stripe`, events `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`.
