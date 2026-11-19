/*
 * Shared UGC order pricing, checkout request builder, and brief validation.
 * Loaded by the order wizard (window.UGCPricing) and by local tests (require).
 * No secrets, no network calls.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.UGCPricing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // USD per video, by length in seconds.
  const FULL_PRICES = Object.freeze({ 15: 80, 30: 100, 45: 100, 60: 120, 90: 150, 120: 160 });
  // Raw footage is 20% less than full-service.
  const RAW_PRICES = Object.freeze({ 15: 64, 30: 80, 45: 80, 60: 96, 90: 120, 120: 128 });
  const BROLL_CLIP_PRICE = 7;
  const LENGTHS = Object.freeze(Object.keys(FULL_PRICES).map(Number));

  const TYPES = Object.freeze({
    full: { label: 'Full-service', detail: 'b-roll and editing', prices: FULL_PRICES, stripeName: 'Full-Service UGC Video' },
    raw: { label: 'Raw footage', detail: 'unedited takes', prices: RAW_PRICES, stripeName: 'Raw UGC Footage' }
  });

  /*
   * Checkout: the site sends { type, length, quantity, clips, ref } to the checkout
   * service, which builds ONE Stripe Checkout Session from its own price list (same
   * prices as above) with fixed quantities, and returns the Stripe URL.
   */
  const CHECKOUT_API = 'https://alexugc-checkout.onrender.com/api/checkout';

  const LIMITS = Object.freeze({
    minQty: 0,
    maxQty: 50,
    minClips: 0,
    maxClips: 200,
    script: 5000,
    scriptLink: 300,
    fileName: 120,
    details: 2000,
    detailLinks: 1000,
    email: 254
  });

  const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[A-Za-z]{2,}$/;
  const REF_RE = /^UGC-[0-9]{6}-[A-Z0-9]{8}$/;

  function isInt(n) { return typeof n === 'number' && Number.isInteger(n); }

  function isEmail(value) {
    return typeof value === 'string' && value.length <= LIMITS.email && EMAIL_RE.test(value.trim());
  }

  function isHttpUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    try {
      const url = new URL(value.trim());
      return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname) && !url.username && !url.password;
    } catch (_) {
      return false;
    }
  }

  function money(dollars) {
    return '$' + Number(dollars).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

  /**
   * Price an order. Input: { quantity, length, type, clips }.
   * quantity (videos) 0 to 50 and clips 0 to 200; at least one must be above zero.
   * length and type only matter when quantity > 0.
   * Returns { ok, error, lines, total, summary, request } where request is the
   * body for the checkout service (without the order reference).
   */
  function quote(order) {
    const o = order || {};
    const quantity = Number(o.quantity);
    const clips = Number(o.clips);
    if (!isInt(quantity) || quantity < LIMITS.minQty || quantity > LIMITS.maxQty) {
      return { ok: false, error: `Choose between ${LIMITS.minQty} and ${LIMITS.maxQty} videos.` };
    }
    if (!isInt(clips) || clips < LIMITS.minClips || clips > LIMITS.maxClips) {
      return { ok: false, error: `Choose between ${LIMITS.minClips} and ${LIMITS.maxClips} b-roll clips.` };
    }
    if (quantity === 0 && clips === 0) return { ok: false, error: 'Add at least one video or one b-roll clip.' };

    const lines = [];
    const request = { type: '', length: 0, quantity, clips };
    if (quantity > 0) {
      const length = Number(o.length);
      if (!LENGTHS.includes(length)) return { ok: false, error: 'Choose a video length.' };
      const t = TYPES[o.type];
      if (!t) return { ok: false, error: 'Choose full-service or raw footage.' };
      const unitPrice = t.prices[length];
      lines.push({ key: 'video', label: `${length}s ${t.label} video`, unitPrice, quantity, subtotal: unitPrice * quantity, stripeName: `${t.stripeName}, ${length} seconds` });
      request.type = o.type;
      request.length = length;
    }
    if (clips > 0) {
      lines.push({ key: 'broll', label: 'B-roll clip', unitPrice: BROLL_CLIP_PRICE, quantity: clips, subtotal: BROLL_CLIP_PRICE * clips, stripeName: 'UGC B-roll Clip' });
    }
    const total = lines.reduce((sum, l) => sum + l.subtotal, 0);
    const summary = lines.map(l => (l.key === 'broll' ? plural(l.quantity, 'b-roll clip', 'b-roll clips') : `${l.quantity} × ${l.label}${l.quantity === 1 ? '' : 's'}`)).join(' + ');
    return { ok: true, lines, total, summary, request };
  }

  /** Validate the full brief. Returns { ok, errors: {field: message}, quote }. */
  function validateBrief(brief) {
    const b = brief || {};
    const errors = {};
    const q = quote(b);
    if (!q.ok) errors.order = q.error;

    const str = v => (typeof v === 'string' ? v : '');
    if (str(b.scriptText).length > LIMITS.script) errors.scriptText = `Script must be ${LIMITS.script} characters or fewer.`;
    if (str(b.scriptLink).trim()) {
      if (str(b.scriptLink).length > LIMITS.scriptLink || !isHttpUrl(b.scriptLink)) errors.scriptLink = 'Enter a full link that starts with https://';
    }
    if (str(b.scriptFileName).length > LIMITS.fileName) errors.scriptFileName = 'File name is too long.';
    if (b.physical !== 'yes' && b.physical !== 'no') errors.physical = 'Choose yes or no.';
    if (str(b.details).length > LIMITS.details) errors.details = `Details must be ${LIMITS.details} characters or fewer.`;
    if (str(b.detailLinks).length > LIMITS.detailLinks) errors.detailLinks = `Links must be ${LIMITS.detailLinks} characters or fewer.`;
    if (!isEmail(str(b.email))) errors.email = 'Enter a valid email address, like you@yourbrand.com.';

    return { ok: Object.keys(errors).length === 0, errors, quote: q };
  }

  return { FULL_PRICES, RAW_PRICES, LENGTHS, BROLL_CLIP_PRICE, TYPES, LIMITS, CHECKOUT_API, REF_RE, quote, validateBrief, isEmail, isHttpUrl, money };
});
