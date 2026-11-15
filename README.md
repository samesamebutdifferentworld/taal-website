# Taal website

Static marketing site for Taal. Files live in `public/`; deployed to Cloudflare Workers (static assets) via `wrangler.jsonc`.

## Licence service

`src/worker.js` also answers `GET /api/licence` for client studios' booking systems
(see the booking repo's README, "Licence"). Licences are entries in the
`taal-licences` KV namespace: key = the studio's licence key, value =
`{"studio":"Name","status":"active"}`, or `{"studio":"Name","status":"ended","ended_at":"YYYY-MM-DD"}`
when a plan ends. Edit them in the Cloudflare dashboard under Storage & databases → KV.
