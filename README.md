# Alex UGC Pro

The public portfolio and one-time package website for Alexander Miller's UGC services.

## Live site

https://alexugcpro.com/ (GitHub Pages source until custom domain is verified)

## Build

No framework, build step, external API key, or server-side processing is required. The site is plain HTML, CSS, and JavaScript, suitable for GitHub Pages. To preview locally, run `python3 -m http.server` from this folder.

## Features

- Seven optimized, poster-first UGC videos with a keyboard-accessible native video dialog
- Three live Stripe Payment Links for packages: Starter $90, Growth $250, and Scale $420
- Custom length checkout via Stripe Payment Links (15s-120s) with quantity 1-100
- SEO pages: `/portfolio/`, `/ugc-video-ads/`, `/product-videos/`
- Alternate order CTAs for Fiverr and Upwork profiles
- GA4 + Search Console: `analytics.js` loads measurement ID `G-7Y59SW5F2S`; each HTML page includes the google-site-verification meta
- Google Forms creative brief, matched to Stripe payment with a shared order reference
- Verified Upwork profile facts and supplied Fiverr, Billo, Instagram, and TikTok links
- Responsive editorial layout with reduced-motion support
- A client-side project brief helper on the home page that creates copyable details without transmitting them

Portfolio media and creator imagery are supplied by Alexander Miller. No unverified testimonials, ratings, or performance claims are presented.

## Deployment

Source and deployment branch: `main`. GitHub Pages publishes `main` from the repository root. The complete working tree, including its Git history, is also kept at `/workspace/ugc-site` on the agent computer.
