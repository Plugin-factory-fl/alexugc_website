# Alex UGC Pro

The public portfolio and one-time package website for Alexander Miller's UGC services.

## Live site

https://alexugcpro.com/ (GitHub Pages source until custom domain is verified)

## Build

The site is plain HTML, CSS, and JavaScript on GitHub Pages, with no build step. To preview locally, run `python3 -m http.server` from this folder. Checkout uses one small API (`checkout-api/`, deployed separately on Render) that creates Stripe Checkout Sessions; see `checkout-api/README.md`.

## Features

- Seven optimized, poster-first UGC videos with a keyboard-accessible native video dialog
- One-question-at-a-time order wizard at `/order/`: video count and length, content type (completed, raw footage, or b-roll), b-roll clip count (b-roll only), script (upload .txt/.md, link, or paste up to 5,000 characters), physical product yes/no, extra details, email, review, then Stripe Checkout
- Pricing in `order/pricing.js`, shared by the wizard and the checkout API: completed videos and raw footage $80 (15s), $100 (30s/45s), $120 (60s), $150 (90s), $160 (120s) per video; b-roll $7 per clip
- The full brief is stored in the Stripe Checkout Session and PaymentIntent metadata, never in URLs or analytics
- Thank-you page at `/order/thank-you/`
- SEO pages: `/portfolio/`, `/ugc-video-ads/`, `/product-videos/`
- Alternate order CTAs for Fiverr and Upwork profiles
- GA4 + Search Console: `analytics.js` loads measurement ID `G-7Y59SW5F2S`; each HTML page includes the google-site-verification meta
- Verified Upwork profile facts and supplied Fiverr, Billo, Instagram, and TikTok links
- Responsive editorial layout with reduced-motion support
- A client-side project brief helper on the home page that creates copyable details without transmitting them

Portfolio media and creator imagery are supplied by Alexander Miller. No unverified testimonials, ratings, or performance claims are presented.

## Deployment

Source and deployment branch: `main`. GitHub Pages publishes `main` from the repository root. The complete working tree, including its Git history, is also kept at `/workspace/ugc-site` on the agent computer.
