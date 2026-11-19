#!/usr/bin/env node
/**
 * alexugcpro.com checkout service (zero dependencies, Node 20+).
 *
 * Creates ONE Stripe Checkout Session (mode=payment) per order with exact line items
 * and fixed quantities. Prices come only from the allowlist below (existing Stripe
 * Price ids on the MegaMix account); the browser sends item choices and counts only.
 *
 *   GET  /health        -> {"ok":true,"configured":bool,"pricesVerified":bool}
 *   POST /api/checkout  body {type, length, quantity, clips, ref, email?, brief?}
 *   POST /api/stripe-webhook  Stripe events checkout.session.completed / .expired (signed)
 *                       -> {"ok":true,"url":"https://checkout.stripe.com/..."}
 *
 * Env: STRIPE_SECRET_KEY (restricted key: Checkout Sessions write, Prices read). Never logged.
 * Webhook: STRIPE_WEBHOOK_SECRET (whsec_...). Email: RESEND_API_KEY, NOTIFY_FROM, NOTIFY_TO.
 * Optional: ALLOWED_ORIGINS (comma list), SITE_URL, STRIPE_API_BASE / RESEND_API_BASE / FORM_ACTION_URL (tests only),
 *   CHECKOUT_EXPIRES_MIN (default 60, Stripe allows 30 to 1440).
 */
import http from 'node:http';
import { createHash } from 'node:crypto';
import { cleanBrief, hasBrief, briefText, briefMetadata, verifyStripeSignature, orderSummary, paidEmail, sendEmail, formBodies, postForm } from './orders.mjs';

const PORT = Number(process.env.PORT || 10000);
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_API = process.env.STRIPE_API_BASE || 'https://api.stripe.com';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const RESEND_KEY = process.env.RESEND_API_KEY || '';
const RESEND_API = process.env.RESEND_API_BASE || 'https://api.resend.com';
const NOTIFY_FROM = process.env.NOTIFY_FROM || '';
const NOTIFY_TO = process.env.NOTIFY_TO || 'alexanderlmiller500@gmail.com';
const FORM_URL = process.env.FORM_ACTION_URL || undefined;
const EXPIRES_MIN = Math.min(1440, Math.max(30, Number(process.env.CHECKOUT_EXPIRES_MIN || 60)));
const SITE = (process.env.SITE_URL || 'https://alexugcpro.com').replace(/\/$/, '');
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS || 'https://alexugcpro.com,https://www.alexugcpro.com').split(',').map(s => s.trim()).filter(Boolean));

// Server side price list. Amounts are in cents and are checked against Stripe at startup.
const PRICES = Object.freeze({
  full: {
    15: { id: 'price_1UaGUY0A1ZGjwd5gqBRzrbG4', cents: 8000 },
    30: { id: 'price_1UaGUZ0A1ZGjwd5gKfZ2X44n', cents: 10000 },
    45: { id: 'price_1UaGUa0A1ZGjwd5gT2dNyi6A', cents: 10000 },
    60: { id: 'price_1UaGUc0A1ZGjwd5gppy5Cfcf', cents: 12000 },
    90: { id: 'price_1UaGUf0A1ZGjwd5ga1jeGie4', cents: 15000 },
    120: { id: 'price_1UaGUh0A1ZGjwd5gf6e3DEG1', cents: 16000 }
  },
  raw: {
    15: { id: 'price_1UaGH30A1ZGjwd5g2xQ7dQv0', cents: 6400 },
    30: { id: 'price_1UaGH90A1ZGjwd5gd2qooZh8', cents: 8000 },
    45: { id: 'price_1UaGHB0A1ZGjwd5gGCKz2X86', cents: 8000 },
    60: { id: 'price_1UaGHE0A1ZGjwd5gFfcF7RTz', cents: 9600 },
    90: { id: 'price_1UaGHG0A1ZGjwd5g4S3SEZly', cents: 12000 },
    120: { id: 'price_1UaGHJ0A1ZGjwd5gJJG1EzIm', cents: 12800 }
  },
  broll: { id: 'price_1UaGHL0A1ZGjwd5gAbzrTMUt', cents: 700 }
});
const LIMITS = Object.freeze({ maxVideos: 50, maxClips: 200 });
const REF_RE = /^UGC-[0-9]{6}-[A-Z0-9]{8}$/;
// Basic email shape check for prefilling Stripe Checkout. Invalid or missing emails are simply omitted.
const EMAIL_RE = /^[^\s@<>()\[\],;:"]+@[^\s@<>()\[\],;:"]+\.[A-Za-z]{2,}$/;
const EMAIL_MAX = 254;
export function cleanEmail(v) {
  const e = typeof v === 'string' ? v.trim() : '';
  return e.length > 0 && e.length <= EMAIL_MAX && EMAIL_RE.test(e) ? e : '';
}

let pricesVerified = false;
let verifyError = '';

function allPrices() {
  const list = [PRICES.broll];
  for (const t of ['full', 'raw']) for (const L of Object.keys(PRICES[t])) list.push(PRICES[t][L]);
  return list;
}

async function stripe(path, { method = 'GET', form, idempotencyKey } = {}) {
  const headers = { Authorization: `Bearer ${STRIPE_KEY}`, 'Stripe-Version': '2024-06-20' };
  if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const resp = await fetch(`${STRIPE_API}${path}`, { method, headers, body: form ? form.toString() : undefined });
  let data = {};
  try { data = await resp.json(); } catch (_) { data = {}; }
  if (!resp.ok) {
    const e = new Error((data && data.error && data.error.message) || `Stripe error ${resp.status}`);
    e.status = resp.status;
    throw e;
  }
  return data;
}

/** Confirm every allowlisted price exists, is active, one time USD, and has the expected amount. */
async function verifyPrices() {
  if (!STRIPE_KEY) { pricesVerified = false; verifyError = 'not configured'; return; }
  try {
    for (const p of allPrices()) {
      const d = await stripe(`/v1/prices/${p.id}`);
      if (!d.active || d.type !== 'one_time' || d.currency !== 'usd' || d.unit_amount !== p.cents) {
        throw new Error(`price check failed for ${p.id}`);
      }
    }
    pricesVerified = true; verifyError = '';
    console.log('prices verified');
  } catch (e) {
    pricesVerified = false; verifyError = 'price check failed';
    console.error('price verification failed:', e.message);
  }
}

/** Turn the browser's choices into Stripe line items. Throws a user safe message on bad input. */
export function buildOrder(body) {
  const b = body && typeof body === 'object' ? body : {};
  const quantity = Number(b.quantity ?? 0);
  const clips = Number(b.clips ?? 0);
  const ref = String(b.ref || '');
  if (!REF_RE.test(ref)) throw new Error('Missing order reference.');
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > LIMITS.maxVideos) throw new Error(`Choose 0 to ${LIMITS.maxVideos} videos.`);
  if (!Number.isInteger(clips) || clips < 0 || clips > LIMITS.maxClips) throw new Error(`Choose 0 to ${LIMITS.maxClips} b-roll clips.`);
  if (quantity === 0 && clips === 0) throw new Error('Add at least one video or b-roll clip.');
  const lines = [];
  if (quantity > 0) {
    const table = PRICES[b.type];
    const p = table && table[Number(b.length)];
    if (!p) throw new Error('Choose a video type and length.');
    lines.push({ price: p.id, quantity, cents: p.cents });
  }
  if (clips > 0) lines.push({ price: PRICES.broll.id, quantity: clips, cents: PRICES.broll.cents });
  const totalCents = lines.reduce((s, l) => s + l.cents * l.quantity, 0);
  return { ref, email: cleanEmail(b.email), brief: cleanBrief(b.brief), lines, totalCents, summary: { type: quantity ? b.type : '', length: quantity ? Number(b.length) : 0, quantity, clips } };
}

async function createSession(order) {
  const f = new URLSearchParams();
  f.set('mode', 'payment');
  f.set('client_reference_id', order.ref);
  // Prefill the email the buyer gave in the order wizard (POST body only; never logged).
  if (order.email) f.set('customer_email', order.email);
  f.set('success_url', `${SITE}/order/thank-you/`);
  f.set('cancel_url', `${SITE}/order/?checkout=canceled`);
  f.set('billing_address_collection', 'auto');
  f.set('submit_type', 'pay');
  // Promotion codes (e.g. a one time 100% test code). A $0 total completes without a card.
  f.set('allow_promotion_codes', 'true');
  order.lines.forEach((l, i) => {
    f.set(`line_items[${i}][price]`, l.price);
    f.set(`line_items[${i}][quantity]`, String(l.quantity));
  });
  f.set('custom_fields[0][key]', 'brand_name');
  f.set('custom_fields[0][label][type]', 'custom');
  f.set('custom_fields[0][label][custom]', 'Brand or product name');
  f.set('custom_fields[0][type]', 'text');
  f.set('custom_fields[0][optional]', 'true');
  f.set('custom_fields[0][text][maximum_length]', '120');
  f.set('custom_text[submit][message]', `Order reference ${order.ref}. Your brief is saved with this reference. Delivery in 5 to 7 days by email as a Google Drive link, unless we agree otherwise. If your order needs more time, I will email you personally.`);
  const meta = { order_ref: order.ref, website: 'alexugc_website', flow: 'order_wizard_checkout_v4',
    video_type: order.summary.type, video_length: String(order.summary.length || ''), videos: String(order.summary.quantity), broll_clips: String(order.summary.clips),
    expected_total_cents: String(order.totalCents) };
  for (const [k, v] of Object.entries(meta)) { f.set(`metadata[${k}]`, v); f.set(`payment_intent_data[metadata][${k}]`, v); }
  // The full brief rides on the session (not the payment) so the webhook can read it back.
  if (hasBrief(order.brief)) for (const [k, v] of Object.entries(briefMetadata(briefText(order.brief)))) f.set(`metadata[${k}]`, v);
  // Short expiry so abandoned checkouts are reported within about an hour.
  f.set('expires_at', String(Math.floor(Date.now() / 1000) + EXPIRES_MIN * 60));
  f.set('payment_intent_data[description]', `alexugcpro.com order ${order.ref}`);
  const briefTag = hasBrief(order.brief) ? createHash('sha256').update(briefText(order.brief)).digest('hex').slice(0, 12) : 'nobrief';
  const emailTag = order.email ? createHash('sha256').update(order.email.toLowerCase()).digest('hex').slice(0, 12) : 'none';
  const key = `ugc-${order.ref}-${order.lines.map(l => `${l.price}x${l.quantity}`).join('-')}-${emailTag}-${briefTag}-${Math.floor(Date.now() / 600000)}`;
  const s = await stripe('/v1/checkout/sessions', { method: 'POST', form: f, idempotencyKey: key });
  if (!s.url || !/^https:\/\/checkout\.stripe\.com\//.test(s.url)) throw new Error('Unexpected Stripe response');
  if (typeof s.amount_subtotal === 'number' && s.amount_subtotal !== order.totalCents) throw new Error('Total mismatch');
  return s;
}

// Tiny in-memory rate limit: 20 checkout attempts per IP per 10 minutes.
const RATE_LIMIT = Number(process.env.RATE_LIMIT || 20);
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 600000);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > RATE_LIMIT;
}

function send(res, status, obj, origin) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '600';
  }
  res.writeHead(status, headers);
  res.end(status === 204 ? undefined : JSON.stringify(obj));
}

export const server = http.createServer((req, res) => {
  const origin = req.headers.origin || '';
  const path = (req.url || '/').split('?')[0];
  if (req.method === 'OPTIONS') return send(res, ALLOWED_ORIGINS.has(origin) ? 204 : 403, {}, origin);
  if (req.method === 'GET' && (path === '/health' || path === '/')) {
    return send(res, 200, { ok: true, service: 'alexugc-checkout', configured: Boolean(STRIPE_KEY), pricesVerified, webhook: Boolean(WEBHOOK_SECRET), email: Boolean(RESEND_KEY && NOTIFY_FROM) }, origin);
  }
  if (req.method === 'POST' && path === '/api/checkout') {
    if (!ALLOWED_ORIGINS.has(origin)) return send(res, 403, { ok: false, error: 'Origin not allowed.' }, origin);
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (limited(ip)) return send(res, 429, { ok: false, error: 'Too many attempts. Please wait a few minutes.' }, origin);
    let body = '';
    let tooBig = false;
    req.on('data', c => { body += c; if (body.length > 65536) { tooBig = true; req.destroy(); } });
    req.on('end', async () => {
      if (tooBig) return;
      let order;
      try { order = buildOrder(JSON.parse(body || '{}')); } catch (e) { return send(res, 400, { ok: false, error: e instanceof SyntaxError ? 'Bad request.' : e.message }, origin); }
      if (!STRIPE_KEY) return send(res, 503, { ok: false, error: 'Checkout is not configured yet.' }, origin);
      if (!pricesVerified) { await verifyPrices(); if (!pricesVerified) return send(res, 503, { ok: false, error: 'Checkout is temporarily unavailable.' }, origin); }
      try {
        const s = await createSession(order);
        console.log(`session created ref=${order.ref} total=${order.totalCents}`);
        return send(res, 200, { ok: true, url: s.url }, origin);
      } catch (e) {
        console.error(`session failed ref=${order.ref}: ${String(e.message).replace(/\S+@\S+/g, "[email]")}`);
        return send(res, 502, { ok: false, error: 'Checkout could not be started. Please try again.' }, origin);
      }
    });
    return;
  }
  if (req.method === 'POST' && path === '/api/stripe-webhook') {
    const chunks = [];
    let size = 0;
    req.on('data', c => { size += c.length; if (size > 1048576) { req.destroy(); return; } chunks.push(c); });
    req.on('end', async () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!WEBHOOK_SECRET) return send(res, 503, { ok: false, error: 'Webhook not configured.' });
      if (!verifyStripeSignature(raw, req.headers['stripe-signature'], WEBHOOK_SECRET)) return send(res, 400, { ok: false, error: 'Bad signature.' });
      let event;
      try { event = JSON.parse(raw); } catch (_) { return send(res, 400, { ok: false, error: 'Bad payload.' }); }
      try {
        const result = await handleEvent(event);
        return send(res, result.ok ? 200 : 500, result);
      } catch (e) {
        console.error(`webhook ${event.type} failed: ${String(e.message).replace(/\S+@\S+/g, '[email]')}`);
        return send(res, 500, { ok: false });
      }
    });
    return;
  }
  send(res, 404, { ok: false, error: 'Not found.' }, origin);
});

// Per session progress, so Stripe retries never repeat a finished step (email, form post).
// In memory: after a restart a retry could repeat the form post; the email is still
// deduplicated by Resend's 24 hour Idempotency-Key.
const progress = new Map();
function step(id) {
  if (!progress.has(id)) { progress.set(id, {}); if (progress.size > 5000) progress.delete(progress.keys().next().value); }
  return progress.get(id);
}

export async function handleEvent(event) {
  const type = event && event.type;
  if (type !== 'checkout.session.completed' && type !== 'checkout.session.expired') return { ok: true, ignored: 'type' };
  const session = event.data && event.data.object;
  if (!session || !session.id || !session.metadata || session.metadata.website !== 'alexugc_website') return { ok: true, ignored: 'not a UGC order' };
  const items = await stripe(`/v1/checkout/sessions/${encodeURIComponent(session.id)}/line_items?limit=100`);
  const o = orderSummary(session, items.data);
  const st = step(session.id);
  if (type === 'checkout.session.completed') {
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return { ok: true, ignored: 'not paid yet' };
    let ok = true;
    if (!st.email) {
      if (RESEND_KEY && NOTIFY_FROM) {
        const m = paidEmail(o);
        st.email = await sendEmail({ apiKey: RESEND_KEY, from: NOTIFY_FROM, to: NOTIFY_TO, subject: m.subject, text: m.text, idempotencyKey: `ugc-paid-${session.id}`, base: RESEND_API });
        if (!st.email) ok = false;
      } else {
        st.email = 'not configured';
      }
    }
    if (!st.formPaid) { st.formPaid = await postForm(formBodies(o, 'PAID'), { action: FORM_URL }); if (!st.formPaid) ok = false; }
    console.log(`order paid ref=${o.ref} total=${o.total} email=${st.email === true ? 'sent' : st.email || 'failed'} form=${st.formPaid ? 'posted' : 'failed'}`);
    return { ok, email: st.email === true ? 'sent' : st.email || 'failed', form: Boolean(st.formPaid) };
  }
  if (!st.formAbandoned) st.formAbandoned = await postForm(formBodies(o, 'ABANDONED'), { action: FORM_URL });
  console.log(`checkout abandoned ref=${o.ref} form=${st.formAbandoned ? 'posted' : 'failed'}`);
  return { ok: Boolean(st.formAbandoned), form: Boolean(st.formAbandoned) };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  server.listen(PORT, () => { console.log(`alexugc-checkout listening on ${PORT}, configured=${Boolean(STRIPE_KEY)}`); verifyPrices(); });
}
