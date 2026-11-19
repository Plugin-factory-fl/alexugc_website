/**
 * Order brief storage, Stripe webhook verification, and paid / abandoned notifications.
 *
 * The brief travels from the order wizard to the server in the POST body only. It is stored
 * on the Checkout Session itself as metadata chunks (Stripe allows 50 keys of 500 characters),
 * so nothing depends on local disk. When Stripe reports the session completed or expired,
 * the webhook reads it back and:
 *   completed -> emails Alexander the full order (if an email provider is configured) and
 *                posts it to the Google Form marked PAID ORDER
 *   expired   -> posts it to the Google Form marked ABANDONED CHECKOUT (no email)
 * Logs never contain emails, scripts, links, or details.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const BRIEF_LIMITS = Object.freeze({ scriptText: 5000, scriptLink: 300, scriptFileName: 120, details: 2000, detailLinks: 1000 });
const CHUNK = 500;
const MAX_CHUNKS = 38; // 8 order keys + brief_parts + brief_truncated + 38 chunks = 48 of Stripe's 50 keys
export const DELIVERY_NOTE = 'Delivery in 5 to 7 days by email as a Google Drive link, unless we agree otherwise. If your order needs more time, I will email you personally.';

const str = v => (typeof v === 'string' ? v : '');
const cap = (v, n) => str(v).replace(/\r\n?/g, '\n').trim().slice(0, n);
const httpsOnly = v => (/^https?:\/\/\S+$/i.test(v) ? v : '');

/** Clean the brief object sent by the wizard. Unknown keys are ignored; long values are capped. */
export function cleanBrief(b) {
  const o = b && typeof b === 'object' ? b : {};
  return {
    scriptText: cap(o.scriptText, BRIEF_LIMITS.scriptText),
    scriptLink: httpsOnly(cap(o.scriptLink, BRIEF_LIMITS.scriptLink)),
    scriptFileName: cap(o.scriptFileName, BRIEF_LIMITS.scriptFileName).replace(/\n/g, ' '),
    physical: o.physical === 'yes' ? 'yes' : o.physical === 'no' ? 'no' : '',
    details: cap(o.details, BRIEF_LIMITS.details),
    detailLinks: cap(o.detailLinks, BRIEF_LIMITS.detailLinks)
  };
}

export function hasBrief(b) {
  return Boolean(b && (b.scriptText || b.scriptLink || b.scriptFileName || b.physical || b.details || b.detailLinks));
}

/** The full brief as readable text. */
export function briefText(b) {
  const lines = [];
  lines.push(`Ship a physical product to Alex: ${b.physical === 'yes' ? 'Yes' : b.physical === 'no' ? 'No' : 'Not answered'}`);
  if (b.scriptLink) lines.push(`Script link: ${b.scriptLink}`);
  if (b.scriptFileName) lines.push(`Script file: ${b.scriptFileName}`);
  lines.push('', 'SCRIPT:', b.scriptText || '(none provided)');
  lines.push('', 'ADDITIONAL DETAILS:', b.details || '(none)');
  if (b.detailLinks) lines.push('', 'REFERENCE LINKS:', b.detailLinks);
  return lines.join('\n');
}

/** Split brief text into Checkout Session metadata keys brief_01..brief_NN. */
export function briefMetadata(text) {
  const meta = {};
  const room = CHUNK * MAX_CHUNKS;
  let t = text;
  let truncated = false;
  if (t.length > room) {
    const note = '\n\n[Brief truncated to fit Stripe. Ask the buyer for the rest.]';
    t = t.slice(0, room - note.length) + note;
    truncated = true;
  }
  const parts = [];
  for (let i = 0; i < t.length; i += CHUNK) parts.push(t.slice(i, i + CHUNK));
  parts.forEach((p, i) => { meta[`brief_${String(i + 1).padStart(2, '0')}`] = p; });
  meta.brief_parts = String(parts.length);
  meta.brief_truncated = truncated ? 'yes' : 'no';
  return meta;
}

/** Rebuild the brief text from session metadata. */
export function briefFromMetadata(meta) {
  const m = meta || {};
  const n = Number(m.brief_parts || 0);
  let t = '';
  for (let i = 1; i <= n; i++) t += m[`brief_${String(i).padStart(2, '0')}`] || '';
  return t;
}

/** Verify a Stripe-Signature header (v1 HMAC SHA256 over "t.payload"), 5 minute tolerance. */
export function verifyStripeSignature(rawBody, header, secret, nowSec = Math.floor(Date.now() / 1000), tolerance = 300) {
  if (!secret || !header) return false;
  const parts = {};
  for (const kv of String(header).split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) { const k = kv.slice(0, i).trim(); (parts[k] = parts[k] || []).push(kv.slice(i + 1).trim()); }
  }
  const t = Number((parts.t || [])[0]);
  if (!Number.isFinite(t) || Math.abs(nowSec - t) > tolerance) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest();
  return (parts.v1 || []).some(sig => {
    const buf = Buffer.from(sig, 'hex');
    return buf.length === expected.length && timingSafeEqual(buf, expected);
  });
}

const money = cents => `$${(Number(cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Everything needed for the email and the form, from a session plus its line items. */
export function orderSummary(session, lineItems) {
  const m = session.metadata || {};
  const brand = ((session.custom_fields || []).find(f => f.key === 'brand_name') || {}).text?.value || '';
  const td = session.total_details || {};
  return {
    ref: m.order_ref || session.client_reference_id || '',
    sessionId: session.id,
    status: session.status,
    paymentStatus: session.payment_status,
    buyerEmail: (session.customer_details && session.customer_details.email) || session.customer_email || '',
    brand,
    lines: (lineItems || []).map(l => ({ name: l.description || 'Item', quantity: l.quantity, unit: l.price && l.price.unit_amount, total: l.amount_total, subtotal: l.amount_subtotal })),
    subtotal: session.amount_subtotal,
    discount: td.amount_discount || 0,
    total: session.amount_total,
    videos: Number(m.videos || 0),
    brief: briefFromMetadata(m),
    truncated: m.brief_truncated === 'yes'
  };
}

export function paidEmail(o) {
  const subject = `New UGC order ${o.ref} (${money(o.total)})`;
  const items = o.lines.map(l => `  ${l.quantity} x ${l.name}${l.unit != null ? ` at ${money(l.unit)}` : ''} = ${money(l.subtotal != null ? l.subtotal : l.total)}`).join('\n');
  const text = [
    `New paid order on alexugcpro.com`,
    '',
    `Order reference: ${o.ref}`,
    `Buyer email: ${o.buyerEmail || '(not given)'}`,
    `Brand or product: ${o.brand || '(not given)'}`,
    '',
    'Items:',
    items || '  (none)',
    `Subtotal: ${money(o.subtotal)}`,
    o.discount ? `Discount (promo code): -${money(o.discount)}` : 'Discount: none',
    `Total paid: ${money(o.total)}`,
    '',
    `Delivery promised: ${DELIVERY_NOTE}`,
    '',
    '----- BRIEF -----',
    o.brief || '(no brief was sent)',
    o.truncated ? '\n(The brief was truncated to fit Stripe.)' : '',
    '',
    `Stripe Checkout Session: ${o.sessionId}`
  ].join('\n');
  return { subject, text };
}

/** Send through Resend's HTTPS API. Returns true on success. Idempotent per session for 24h. */
export async function sendEmail({ apiKey, from, to, subject, text, idempotencyKey, fetchImpl = fetch, base = 'https://api.resend.com' }) {
  const resp = await fetchImpl(`${base}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ from, to: [to], subject, text })
  });
  return resp.ok;
}

// Google Form "UGC Creative Brief | Alex Miller"
export const FORM_ACTION = 'https://docs.google.com/forms/d/e/1FAIpQLSei67lcSfxrYHIJpJu3xVFBtnc1INO2vJ2ySxGfWfLOYCd5Hw/formResponse';
const ENTRY = { orderType: 'entry.2147031447', reference: 'entry.2069755540', name: 'entry.354187871', email: 'entry.86149281', brand: 'entry.1526207630', videos: 'entry.698467984', directions: 'entry.1314869938', link: 'entry.1529610763' };
const PART_LIMIT = 3000;

/** Google Form bodies for one order, labeled PAID ORDER or ABANDONED CHECKOUT. Long briefs are split. */
export function formBodies(o, label) {
  const paid = label === 'PAID';
  const head = [
    paid ? `STATUS: PAID ORDER (total paid ${money(o.total)})` : `STATUS: ABANDONED CHECKOUT (not paid, Stripe session expired)`,
    `Order reference: ${o.ref}`,
    `Items: ${o.lines.map(l => `${l.quantity} x ${l.name}`).join(', ') || '(see Stripe)'}`,
    `Subtotal ${money(o.subtotal)}${o.discount ? `, discount -${money(o.discount)}` : ''}${paid ? `, paid ${money(o.total)}` : ''}`
  ].join('\n');
  const body = o.brief || '(no brief was sent)';
  const room = PART_LIMIT - head.length - 40;
  const pieces = [];
  for (let i = 0; i < body.length || i === 0; i += room) pieces.push(body.slice(i, i + room));
  const scriptLink = (o.brief.match(/^Script link: (\S+)/m) || [])[1] || '';
  return pieces.map((p, i) => {
    const f = new URLSearchParams();
    f.set(ENTRY.orderType, 'Custom length and quantity');
    f.set(ENTRY.reference, o.ref);
    f.set(ENTRY.name, paid ? 'PAID ORDER' : 'ABANDONED CHECKOUT (not paid)');
    f.set(ENTRY.email, o.buyerEmail || 'not.given@alexugcpro.com');
    f.set(ENTRY.brand, o.brand || (paid ? 'Not given at checkout' : 'Not given'));
    if (o.videos > 0) f.set(ENTRY.videos, String(o.videos));
    f.set(ENTRY.directions, `${head}\nPart ${i + 1} of ${pieces.length}\n\n${p}`);
    if (i === 0 && scriptLink) f.set(ENTRY.link, scriptLink);
    f.set('fvv', '1');
    f.set('pageHistory', '0');
    return f;
  });
}

export async function postForm(bodies, { fetchImpl = fetch, action = FORM_ACTION } = {}) {
  for (const b of bodies) {
    const r = await fetchImpl(action, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: b.toString(), redirect: 'manual' });
    if (!(r.ok || (r.status >= 300 && r.status < 400))) return false;
  }
  return true;
}
