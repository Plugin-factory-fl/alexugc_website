/*
 * Shared UGC order pricing, Stripe Payment Link map, and brief validation.
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
   * Stripe Payment Links (live, acct MegaMix). One link per line-item combination.
   * Each link has adjustable quantities (videos 1-100, clips 1-200) and redirects
   * to /order/thank-you/ after payment. Key: "<type>_<length>" and/or "broll".
   */
  const PAYMENT_LINKS = Object.freeze({
    broll: 'https://buy.stripe.com/9B69ALgMX1Y4dIKelU2Nq0X',
    full_15: 'https://buy.stripe.com/14AfZ90NZ8mscEG7Xw2Nq1m',
    full_30: 'https://buy.stripe.com/eVq9AL8greKQ202a5E2Nq1n',
    full_45: 'https://buy.stripe.com/00w28j68jcCIcEG2Dc2Nq1o',
    full_60: 'https://buy.stripe.com/6oUeV554f9qw7kmelU2Nq1p',
    full_90: 'https://buy.stripe.com/dRm7sD68j5agdIKfpY2Nq1q',
    full_120: 'https://buy.stripe.com/5kQ6ozgMXbyEawyelU2Nq1r',
    raw_15: 'https://buy.stripe.com/6oU5kv0NZ1Y448a3Hg2Nq14',
    raw_30: 'https://buy.stripe.com/8x2bITbsD0U06gi4Lk2Nq15',
    raw_45: 'https://buy.stripe.com/6oUeV52W79qwgUWfpY2Nq16',
    raw_60: 'https://buy.stripe.com/eVq00b54f6ek2020v42Nq17',
    raw_90: 'https://buy.stripe.com/5kQ3cneEPgSY346elU2Nq18',
    raw_120: 'https://buy.stripe.com/eVq8wHdAL7io0VYfpY2Nq19',
    'full_15+broll': 'https://buy.stripe.com/cNi7sD7cn8ms9sucdM2Nq1s',
    'full_30+broll': 'https://buy.stripe.com/dRm7sDgMXeKQ202elU2Nq1t',
    'full_45+broll': 'https://buy.stripe.com/4gM8wH68jcCI7km4Lk2Nq1u',
    'full_60+broll': 'https://buy.stripe.com/7sYbIT0NZdGMgUWdhQ2Nq1v',
    'full_90+broll': 'https://buy.stripe.com/bJecMXdALauA48acdM2Nq1w',
    'full_120+broll': 'https://buy.stripe.com/8x2eV5gMX0U08oq2Dc2Nq1x',
    'raw_15+broll': 'https://buy.stripe.com/dRm8wH68jdGM48a3Hg2Nq1g',
    'raw_30+broll': 'https://buy.stripe.com/4gM9AL40bauA346gu22Nq1h',
    'raw_45+broll': 'https://buy.stripe.com/8x29ALfITdGM0VYdhQ2Nq1i',
    'raw_60+broll': 'https://buy.stripe.com/5kQ6oz54f328cEG4Lk2Nq1j',
    'raw_90+broll': 'https://buy.stripe.com/fZu8wH7cncCI202b9I2Nq1k',
    'raw_120+broll': 'https://buy.stripe.com/28EfZ9eEP1Y47kmelU2Nq1l'
  });

  const LIMITS = Object.freeze({
    minQty: 0,
    maxQty: 100,
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
   * quantity (videos) 0-100 and clips 0-200; at least one must be above zero.
   * length and type only matter when quantity > 0.
   * Returns { ok, error, lines: [{key, label, unitPrice, quantity, subtotal, stripeName}], total, linkKey, summary }.
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
    const keyParts = [];
    if (quantity > 0) {
      const length = Number(o.length);
      if (!LENGTHS.includes(length)) return { ok: false, error: 'Choose a video length.' };
      const t = TYPES[o.type];
      if (!t) return { ok: false, error: 'Choose full-service or raw footage.' };
      const unitPrice = t.prices[length];
      lines.push({
        key: 'video',
        label: `${length}s ${t.label} video`,
        unitPrice,
        quantity,
        subtotal: unitPrice * quantity,
        stripeName: `${t.stripeName}, ${length} seconds`
      });
      keyParts.push(`${o.type}_${length}`);
    }
    if (clips > 0) {
      lines.push({ key: 'broll', label: 'B-roll clip', unitPrice: BROLL_CLIP_PRICE, quantity: clips, subtotal: BROLL_CLIP_PRICE * clips, stripeName: 'UGC B-roll Clip' });
      keyParts.push('broll');
    }
    const total = lines.reduce((sum, l) => sum + l.subtotal, 0);
    const linkKey = keyParts.join('+');
    const summary = lines.map(l => (l.key === 'broll' ? plural(l.quantity, 'b-roll clip', 'b-roll clips') : `${l.quantity} × ${l.label}${l.quantity === 1 ? '' : 's'}`)).join(' + ');
    return { ok: true, lines, total, linkKey, summary };
  }

  function paymentLink(order) {
    const q = quote(order);
    return q.ok ? PAYMENT_LINKS[q.linkKey] || '' : '';
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

  return { FULL_PRICES, RAW_PRICES, LENGTHS, BROLL_CLIP_PRICE, TYPES, LIMITS, PAYMENT_LINKS, REF_RE, quote, paymentLink, validateBrief, isEmail, isHttpUrl, money };
});
