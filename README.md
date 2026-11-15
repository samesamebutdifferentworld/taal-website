# Taal website

Static marketing site for Taal. Files live in `public/`; deployed to Cloudflare Workers (static assets) via `wrangler.jsonc`.

## Licence service

`src/worker.js` also answers `GET /api/licence` for client studios' booking systems
(see the booking repo's README, "Licence"). Licences are entries in the
`taal-licences` KV namespace: key = the studio's licence key, value =
`{"studio":"Name","status":"active"}`, or `{"studio":"Name","status":"ended","ended_at":"YYYY-MM-DD"}`
when a plan ends. Edit them in the Cloudflare dashboard under Storage & databases → KV.

## Demo enquiries and the £5 brief

1. The form at the bottom of the site posts to `/api/enquiry`. The enquiry is saved and the
   studio gets a thank-you email with two ways to start: book a call (`CALL_URL`) or send a
   brief (`/brief.html?e=<id>`). You get a copy at `CONTACT_EMAIL`.
2. The brief page takes their logo, colours, classes and prices, then sends them to Stripe
   Checkout for £5. When Stripe confirms, they get a "demo by <date>" email (7 days) and you
   get the whole brief by email.
3. `/admin.html` lists every enquiry and brief, with logos to download. Sign in with `ADMIN_KEY`.

Everything is kept in the `ENQUIRIES` KV namespace (taal-enquiries) and deleted after a year.

Setup, in Cloudflare (Worker > Settings > Variables and secrets):
- Secrets: `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_KEY`.
- In `wrangler.jsonc`: `CONTACT_EMAIL`, `EMAIL_FROM` (a domain verified in Resend), `CALL_URL`.
- Stripe webhook: endpoint `https://<site>/api/stripe/webhook`, event `checkout.session.completed`.

Without an email key, enquiries are still saved (see the admin page) and the site shows both
options on screen. Without a Stripe key, briefs are saved and you send a payment link by hand.

Tests: `node --test test/*.test.mjs`
