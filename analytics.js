(() => {
'use strict';

// GA4 Measurement ID from /workspace/ugc-analytics.json (property Alex UGC Pro).
const measurementId = 'G-7Y59SW5F2S';

const ALLOWED_HOSTS = new Set(['buy.stripe.com', 'www.fiverr.com', 'fiverr.com', 'www.upwork.com', 'upwork.com', 'docs.google.com', 'forms.gle']);

function enabled() {
  return typeof measurementId === 'string' && /^G-[A-Z0-9]+$/i.test(measurementId.trim());
}

function loadGtag() {
  if (!enabled() || window.__ugcAnalyticsLoaded) return;
  window.__ugcAnalyticsLoaded = true;
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  // GA4 masks/does not store IPs by default; anonymize_ip is UA-only and unsupported here.
  gtag('config', measurementId.trim(), {
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId.trim());
  document.head.appendChild(script);
}

function track(eventName, params) {
  if (!enabled() || typeof window.gtag !== 'function') return;
  const safe = {};
  if (params && typeof params === 'object') {
    for (const [key, value] of Object.entries(params)) {
      if (value == null) continue;
      // Never send order references, names, emails, scripts, or free-text briefs.
      if (/ref|name|email|script|brief|phone|address/i.test(key)) continue;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        safe[key] = value;
      }
    }
  }
  window.gtag('event', eventName, safe);
}

function linkKind(anchor) {
  try {
    const url = new URL(anchor.href, window.location.href);
    if (!ALLOWED_HOSTS.has(url.hostname)) return null;
    if (url.hostname === 'buy.stripe.com') return 'stripe';
    if (url.hostname.includes('fiverr')) return 'fiverr';
    if (url.hostname.includes('upwork')) return 'upwork';
    if (url.hostname === 'docs.google.com' || url.hostname === 'forms.gle') return 'google_forms';
  } catch (_) { /* ignore */ }
  return null;
}

function bindClicks() {
  document.addEventListener('click', event => {
    const anchor = event.target.closest && event.target.closest('a[href]');
    if (!anchor || anchor.getAttribute('aria-disabled') === 'true') return;
    const kind = linkKind(anchor);
    if (!kind) return;
    if (kind === 'google_forms' || anchor.id === 'open-brief-form') {
      track('open_creative_brief', { link_host: 'docs.google.com' });
      return;
    }
    if (kind === 'stripe') {
      track('begin_checkout', { checkout_provider: 'stripe' });
      return;
    }
    if (kind === 'fiverr' || kind === 'upwork') {
      track('begin_checkout', { checkout_provider: kind });
    }
  }, true);
}

loadGtag();
bindClicks();
})();
