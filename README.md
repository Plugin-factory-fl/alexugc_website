# Alex UGC Pro

The public portfolio and ordering website for Alexander Miller's UGC services.

## Live site

https://alexugcpro.com/ (GitHub Pages source until custom domain is verified)

## Build

The site is plain HTML, CSS, and JavaScript on GitHub Pages, with no build step and no server. To preview locally, run `python3 -m http.server` from this folder. Checkout uses Stripe Payment Links.

## Features

- Seven optimized, poster-first UGC videos with a keyboard-accessible native video dialog
- One-question-at-a-time order wizard at `/order/`: number of videos (0-100) and b-roll clips (0-200) on the first card (at least one), video length and Full-service vs Raw footage (only when ordering videos), script (upload .txt/.md, link, or paste up to 5,000 characters), physical product yes/no, extra details, email, review, then Stripe
- Pricing in `order/pricing.js`: full-service $80 (15s), $100 (30s/45s), $120 (60s), $150 (90s), $160 (120s) per video; raw footage 20% less: $64, $80, $80, $96, $120, $128; b-roll $7 per clip
- Checkout: `order/pricing.js` maps each line-item combination (video type and length, with or without b-roll, or b-roll alone) to a Stripe Payment Link with adjustable quantities that redirects to `/order/thank-you/`. The review card tells the buyer which quantities to set and the total Stripe should show
- Brief capture: `order/brief.js` posts the answers in the request body to the "UGC Creative Brief | Alex Miller" Google Form with an order reference (e.g. `UGC-261110-K7Q2MZ4H`). The same reference is passed to Stripe as `client_reference_id`, so each payment matches its brief row. Long briefs are split into numbered parts with the same reference. The brief never goes in URLs or analytics
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
