// Alex UGC Pro checkout API.
// Creates a Stripe Checkout Session with server-computed line items and the
// full order brief stored in Checkout Session + PaymentIntent metadata.
// Zero dependencies (Node 18+). Secrets come only from environment variables.
//
// Env:
//   STRIPE_SECRET_KEY  required. A restricted key (rk_live_...) with Checkout Sessions: Write.
//   SITE_URL           default https://alexugcpro.com
//   ALLOWED_ORIGINS    comma-separated, default https://alexugcpro.com,https://www.alexugcpro.com
//   PORT               default 10000 (Render sets this)
//   STRIPE_API_BASE    default https://api.stripe.com (override only for local tests)

import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pricing = require('../order/pricing.js');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const SITE_URL = (process.env.SITE_URL || 'https://alexugcpro.com').replace(/\/+$/, '');
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || 'https://alexugcpro.com,https://www.alexugcpro.com')
    .split(',').map(s => s.trim()).filter(Boolean)
);
const STRIPE_API_BASE = (process.env.STRIPE_API_BASE || 'https://api.stripe.com').replace(/\/+$/, '');
const PORT = Number(process.env.PORT || 10000);
const MAX_BODY = 64 * 1024;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 20);
const META_CHUNK = 500; // Stripe metadata value limit

// ---- tiny in-memory rate limit: RATE_LIMIT_MAX (default 20) checkout attempts / 10 min / IP ----
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter(t => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > RATE_LIMIT_MAX;
}

function clean(value, max) {
  if (typeof value !== 'string') return '';
  // Strip control chars except newline/tab, normalize newlines.
  return value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max);
}

function chunk(prefix, text, maxChunks) {
  const out = {};
  if (!text) return out;
  const parts = [];
  for (let i = 0; i < text.length && parts.length < maxChunks; i += META_CHUNK) parts.push(text.slice(i, i + META_CHUNK));
  parts.forEach((part, i) => { out[`${prefix}_${String(i + 1).padStart(2, '0')}`] = part; });
  out[`${prefix}_parts`] = String(parts.length);
  return out;
}

export function normalizeBrief(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const L = pricing.LIMITS;
  return {
    type: typeof r.type === 'string' ? r.type : '',
    length: Number(r.length),
    quantity: Number(r.quantity),
    clips: Number(r.clips),
    scriptText: clean(r.scriptText, L.script + 1),
    scriptLink: clean(r.scriptLink, L.scriptLink + 1).trim(),
    scriptFileName: clean(r.scriptFileName, L.fileName + 1).trim(),
    physical: r.physical === 'yes' ? 'yes' : r.physical === 'no' ? 'no' : '',
    details: clean(r.details, L.details + 1),
    detailLinks: clean(r.detailLinks, L.detailLinks + 1),
    email: clean(r.email, L.email + 1).trim(),
    website: typeof r.website === 'string' ? r.website : '' // honeypot
  };
}

/** Build the Stripe Checkout Session parameters (pure; exported for tests). */
export function buildSessionParams(brief) {
  const v = pricing.validateBrief(brief);
  if (!v.ok) return { ok: false, errors: v.errors };
  const q = v.quote;
  const isBroll = brief.type === 'broll';
  const typeLabel = pricing.TYPES[brief.type].label;

  const metadata = {
    order_type: typeLabel,
    length_seconds: isBroll ? 'n/a (b-roll)' : String(brief.length),
    video_quantity: isBroll ? 'n/a (b-roll)' : String(brief.quantity),
    broll_clips: isBroll ? String(brief.clips) : 'n/a',
    total_usd: String(q.total),
    buyer_email: brief.email,
    physical_product: brief.physical,
    script_link: brief.scriptLink || '(none)',
    script_file: brief.scriptFileName || '(none)',
    script_chars: String(brief.scriptText.length),
    detail_links: brief.detailLinks ? brief.detailLinks.slice(0, META_CHUNK) : '(none)',
    ...chunk('script', brief.scriptText, 10),          // up to 5000 chars
    ...chunk('details', brief.details, 4),             // up to 2000 chars
    ...(brief.detailLinks.length > META_CHUNK ? { detail_links_2: brief.detailLinks.slice(META_CHUNK, 2 * META_CHUNK) } : {}),
    website: 'alexugc_website',
    brief_version: 'wizard-1'
  };
  const description = `${typeLabel}: ${q.summary}. Physical product: ${brief.physical}. Brief in metadata.`.slice(0, 500);

  const params = {
    mode: 'payment',
    customer_email: brief.email,
    success_url: `${SITE_URL}/order/thank-you/`,
    cancel_url: `${SITE_URL}/order/?checkout=canceled`,
    line_items: [{
      quantity: q.lineItem.quantity,
      price_data: {
        currency: 'usd',
        unit_amount: q.lineItem.unitAmountCents,
        product_data: { name: q.lineItem.name }
      }
    }],
    metadata,
    payment_intent_data: { description, metadata, receipt_email: brief.email },
    custom_fields: [{
      key: 'brand_name',
      label: { type: 'custom', custom: 'Brand or product name' },
      type: 'text',
      optional: true
    }],
    submit_type: 'pay'
  };
  return { ok: true, params, totalCents: q.total * 100 };
}

// Stripe form encoding: a[b][0][c]=v
function encodeForm(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((item, i) => {
      if (item && typeof item === 'object') encodeForm(item, `${key}[${i}]`, out);
      else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
    });
    else if (typeof v === 'object') encodeForm(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.join('&');
}
export { encodeForm };

async function createSession(params) {
  const res = await fetch(`${STRIPE_API_BASE}/v1/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20'
    },
    body: encodeForm(params)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    const code = data && data.error ? data.error.code || data.error.type : res.status;
    throw new Error(`stripe_error:${code}`);
  }
  return data;
}

function send(res, status, body, origin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin'
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '600';
  }
  res.writeHead(status, headers);
  res.end(body === null ? '' : JSON.stringify(body));
}

export const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, configured: Boolean(STRIPE_SECRET_KEY) }, origin);
  if (url.pathname !== '/api/checkout') return send(res, 404, { error: 'not_found' }, origin);
  if (req.method === 'OPTIONS') return send(res, ALLOWED_ORIGINS.has(origin) ? 204 : 403, null, origin);
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' }, origin);
  if (!ALLOWED_ORIGINS.has(origin)) return send(res, 403, { error: 'origin_not_allowed' }, origin);
  if (!STRIPE_SECRET_KEY) return send(res, 503, { error: 'checkout_not_configured' }, origin);

  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (rateLimited(ip)) return send(res, 429, { error: 'too_many_requests' }, origin);

  let size = 0;
  const chunks = [];
  try {
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) return send(res, 413, { error: 'too_large' }, origin);
      chunks.push(c);
    }
  } catch (_) {
    return send(res, 400, { error: 'bad_request' }, origin);
  }

  let raw;
  try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) { return send(res, 400, { error: 'invalid_json' }, origin); }

  const brief = normalizeBrief(raw);
  if (brief.website) return send(res, 400, { error: 'rejected' }, origin); // bot honeypot
  const built = buildSessionParams(brief);
  if (!built.ok) return send(res, 422, { error: 'invalid_brief', fields: built.errors }, origin);

  // Client total must match the server total, or we refuse (never charge a surprise amount).
  if (Number(raw.expectedTotal) * 100 !== built.totalCents) return send(res, 409, { error: 'total_mismatch' }, origin);

  try {
    const session = await createSession(built.params);
    // Log only non-personal identifiers. Never log the brief or email.
    console.log(`checkout_session_created id=${session.id} type=${brief.type} total_cents=${built.totalCents}`);
    return send(res, 200, { url: session.url }, origin);
  } catch (err) {
    console.error(`checkout_session_failed ${err.message}`);
    return send(res, 502, { error: 'stripe_unavailable' }, origin);
  }
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => console.log(`alexugc checkout api listening on ${PORT}`));
}
