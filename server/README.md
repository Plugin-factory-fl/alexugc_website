# alexugc-checkout

A small Render web service that creates one Stripe Checkout Session per order on alexugcpro.com.

* The site sends only `{ type, length, quantity, clips, ref }`. Prices come from the allowlist in `checkout-server.mjs` (existing Stripe Price ids), and are checked against Stripe at startup.
* Quantities are fixed on Stripe (no adjustable quantity). Videos 0 to 50, b-roll 0 to 200.
* `client_reference_id` and metadata carry the order reference. Success goes to `/order/thank-you/`, cancel to `/order/?checkout=canceled`.
* CORS and POST only from https://alexugcpro.com and https://www.alexugcpro.com.

Env: `STRIPE_SECRET_KEY`, a restricted key on the MegaMix account with Checkout Sessions write and Prices read. Never commit it.

Render: build `cd server && npm install`, start `cd server && npm start`, health check `/health`.
Test locally (mock Stripe, no real calls): `cd server && npm test`.
