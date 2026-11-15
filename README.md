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

`/admin.html` lists everyone who built a demo, with links while it lasts. Sign in with `ADMIN_KEY`.

Setup, in Cloudflare (Worker > Settings > Variables and secrets):
- Secrets: `RESEND_API_KEY`, `ADMIN_KEY`.
- In `wrangler.jsonc`: `CONTACT_EMAIL`, `EMAIL_FROM` (a domain verified in Resend), `CALL_URL`.

Without an email key, demos still build and the page shows the links on screen.

Tests: `node --test test/*.test.mjs`
