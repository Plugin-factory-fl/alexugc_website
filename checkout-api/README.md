# Checkout API

Tiny Node 18+ service (no dependencies) used by the order wizard on alexugcpro.com.

`POST /api/checkout` takes the wizard answers as JSON, re-validates them, recomputes the price with
`order/pricing.js`, and creates a Stripe Checkout Session with:

- one line item computed on the server (the client total must match, or the request is refused)
- `customer_email` set to the buyer's email
- `success_url` https://alexugcpro.com/order/thank-you/ and `cancel_url` https://alexugcpro.com/order/?checkout=canceled
- the full brief in Checkout Session metadata and PaymentIntent metadata (script split into `script_01`...`script_10`,
  details into `details_01`...`details_04`), so it shows on the payment in the Stripe Dashboard

It logs only the session id, order type, and total. It never logs the brief or email.

## Deploy on Render

1. In Stripe (MegaMix AI account), create a **restricted key** with only **Checkout Sessions: Write**.
2. In Render, create the service from `render.yaml` (Blueprint) or as a web service:
   runtime Node, build `echo "no dependencies"`, start `node checkout-api/server.mjs`, health check `/health`.
3. Set `STRIPE_SECRET_KEY` to the restricted key in the Render dashboard. Never commit it.
4. Put the service URL in `order/checkout-config.js`, for example
   `window.UGC_CHECKOUT_ENDPOINT = window.UGC_CHECKOUT_ENDPOINT || 'https://alexugc-checkout.onrender.com';`
5. Merge to `main` so GitHub Pages publishes the wizard.

Env: `STRIPE_SECRET_KEY` (required), `SITE_URL`, `ALLOWED_ORIGINS`, `PORT`, `RATE_LIMIT_MAX`, and
`STRIPE_API_BASE` (tests only).
