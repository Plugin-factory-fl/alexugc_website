/*
 * Shared UGC order pricing + brief validation.
 * Loaded by the order wizard in the browser (window.UGCPricing) and by the
 * checkout API (require), so the summary total and the Stripe total always match.
 * No secrets, no network calls.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.UGCPricing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // USD per video, by length in seconds. Raw footage uses the same rates.
  const LENGTH_PRICES = Object.freeze({ 15: 80, 30: 100, 45: 100, 60: 120, 90: 150, 120: 160 });
  const BROLL_CLIP_PRICE = 7;
  const LENGTHS = Object.freeze(Object.keys(LENGTH_PRICES).map(Number));

  const TYPES = Object.freeze({
    completed: { label: 'Completed videos', unit: 'video', productName: 'Completed UGC video' },
    raw: { label: 'Raw footage', unit: 'video', productName: 'Raw UGC footage' },
    broll: { label: 'B-roll clips', unit: 'clip', productName: 'B-roll clip' }
  });

  const LIMITS = Object.freeze({
    minQty: 1,
    maxQty: 100,
    minClips: 1,
    maxClips: 200,
    script: 5000,
    scriptLink: 500,
    fileName: 120,
    details: 2000,
    detailLinks: 1000,
    email: 254
  });

  const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[A-Za-z]{2,}$/;

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

  /**
   * Price an order. Input: { type, length, quantity, clips }.
   * Returns { ok, error, type, unitPrice, units, total, lineItem }.
   * For b-roll, length and video quantity do not apply; only clips count.
   */
  function quote(order) {
    const o = order || {};
    const type = o.type;
    if (!TYPES[type]) return { ok: false, error: 'Choose completed videos, raw footage, or b-roll.' };

    if (type === 'broll') {
      const clips = Number(o.clips);
      if (!isInt(clips) || clips < LIMITS.minClips || clips > LIMITS.maxClips) {
        return { ok: false, error: `Choose between ${LIMITS.minClips} and ${LIMITS.maxClips} b-roll clips.` };
      }
      const total = clips * BROLL_CLIP_PRICE;
      return {
        ok: true,
        type,
        unitPrice: BROLL_CLIP_PRICE,
        units: clips,
        total,
        lineItem: { name: TYPES.broll.productName, unitAmountCents: BROLL_CLIP_PRICE * 100, quantity: clips },
        summary: `${clips} b-roll clip${clips === 1 ? '' : 's'} × ${money(BROLL_CLIP_PRICE)}`
      };
    }

    const length = Number(o.length);
    const quantity = Number(o.quantity);
    if (!LENGTHS.includes(length)) return { ok: false, error: 'Choose a video length.' };
    if (!isInt(quantity) || quantity < LIMITS.minQty || quantity > LIMITS.maxQty) {
      return { ok: false, error: `Choose between ${LIMITS.minQty} and ${LIMITS.maxQty} videos.` };
    }
    const unitPrice = LENGTH_PRICES[length];
    const total = unitPrice * quantity;
    const t = TYPES[type];
    return {
      ok: true,
      type,
      unitPrice,
      units: quantity,
      total,
      lineItem: { name: `${t.productName} (${length}s)`, unitAmountCents: unitPrice * 100, quantity },
      summary: `${quantity} × ${length}s ${type === 'raw' ? 'raw footage video' : 'completed video'}${quantity === 1 ? '' : 's'} × ${money(unitPrice)}`
    };
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

  return { LENGTH_PRICES, LENGTHS, BROLL_CLIP_PRICE, TYPES, LIMITS, quote, validateBrief, isEmail, isHttpUrl, money };
});
