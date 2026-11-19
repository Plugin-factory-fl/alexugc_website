# alexugc-checkout

A small Render web service that creates one Stripe Checkout Session per order on alexugcpro.com.

* The site sends `{ type, length, quantity, clips, ref, email, brief }` in the POST body only. The email prefills Stripe; the brief is stored on the Checkout Session as metadata chunks (`brief_01`..`brief_NN`, `brief_parts`, `brief_truncated`). Prices come from the allowlist in `checkout-server.mjs` (existing Stripe Price ids), and are checked against Stripe at startup.
* Quantities are fixed on Stripe (no adjustable quantity). Videos 0 to 50, b-roll 0 to 200.
* `client_reference_id` and metadata carry the order reference. Success goes to `/order/thank-you/`, cancel to `/order/?checkout=canceled`.
* CORS and POST only from https://alexugcpro.com and https://www.alexugcpro.com.

Env: `STRIPE_SECRET_KEY`, a restricted key on the MegaMix account with Checkout Sessions write and Prices read. Never commit it.

Render: build `cd server && npm install`, start `cd server && npm start`, health check `/health`.
Test locally (mock Stripe, no real calls): `cd server && npm test`.

## Orders and abandoned checkouts

Nothing is reported when the buyer clicks checkout. Stripe calls `POST /api/stripe-webhook` (signature checked with `STRIPE_WEBHOOK_SECRET`):

* `checkout.session.completed`: emails `NOTIFY_TO` (default alexanderlmiller500@gmail.com) the order, total paid, promo discount, delivery note and full brief through Resend (`RESEND_API_KEY`, `NOTIFY_FROM`), and posts it to the Google Form with name `PAID ORDER`.
* `checkout.session.expired` (sessions expire after `CHECKOUT_EXPIRES_MIN`, default 60): posts the brief to the Google Form with name `ABANDONED CHECKOUT (not paid)`. No email.
* Retries: per session steps are remembered in memory; the email also uses Resend's `Idempotency-Key` (`ugc-paid-<session id>`).
* Sessions without `metadata.website = alexugc_website` (other MegaMix checkouts) are ignored.
* `/health` shows `webhook` and `email` booleans. Logs carry only order references and totals.
