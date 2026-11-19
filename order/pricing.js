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
   * Stripe Payment Links (live, acct MegaMix). Every link has ONE line item with a
   * FIXED quantity (no adjustable quantity on Stripe's page), so Stripe's total always
   * equals the website total. Key: "<type>_<length>_x<videos>" or "broll_x<clips>".
   * Video links return to /order/thank-you/; b-roll links return to
   * /order/thank-you/?paid=broll. An order with videos AND b-roll is two checkouts
   * (videos first, then b-roll from the thank-you page), same order reference.
   */
  const PAYMENT_LINKS = Object.freeze({
    broll_x1: 'https://buy.stripe.com/eVq6ozaoz0U0fQSb9I2Nq1A',
    broll_x2: 'https://buy.stripe.com/6oUbITeEPauA2022Dc2Nq1B',
    broll_x3: 'https://buy.stripe.com/bJe8wH7cncCI9sufpY2Nq1C',
    broll_x4: 'https://buy.stripe.com/4gM5kv9kv8ms0VY5Po2Nq1D',
    broll_x5: 'https://buy.stripe.com/3cI3cnfIT7io9su7Xw2Nq1E',
    broll_x6: 'https://buy.stripe.com/8x29AL40b6ek0VYgu22Nq1F',
    broll_x7: 'https://buy.stripe.com/fZudR1gMXdGMgUW4Lk2Nq1G',
    broll_x8: 'https://buy.stripe.com/28EeV540b0U08oq4Lk2Nq1H',
    broll_x9: 'https://buy.stripe.com/5kQbITeEPeKQ5ceb9I2Nq1I',
    broll_x10: 'https://buy.stripe.com/aFa3cndALgSY48afpY2Nq1z',
    broll_x15: 'https://buy.stripe.com/dRmbIT1S3cCI0VY5Po2Nq1J',
    broll_x20: 'https://buy.stripe.com/14AdR1eEPauA6gib9I2Nq1K',
    broll_x25: 'https://buy.stripe.com/aFaaEPdAL6ek6gi0v42Nq1L',
    broll_x30: 'https://buy.stripe.com/5kQ6oz40b8msbACelU2Nq1M',
    broll_x40: 'https://buy.stripe.com/14A14f2W70U0cEG4Lk2Nq1N',
    broll_x50: 'https://buy.stripe.com/fZu3cn40b9qwfQS2Dc2Nq1O',
    broll_x75: 'https://buy.stripe.com/8x28wHeEPfOUawya5E2Nq1P',
    broll_x100: 'https://buy.stripe.com/9B6eV57cnfOU2026Ts2Nq1Q',
    full_15_x1: 'https://buy.stripe.com/28E14f9kvcCI2026Ts2Nq1R',
    full_15_x2: 'https://buy.stripe.com/bJecMX2W78mseMOb9I2Nq1S',
    full_15_x3: 'https://buy.stripe.com/3cI5kvbsDfOUdIK6Ts2Nq1T',
    full_15_x4: 'https://buy.stripe.com/9B63cn1S3auA20291A2Nq1U',
    full_15_x5: 'https://buy.stripe.com/bJeaEPeEP6ek7kmfpY2Nq1V',
    full_15_x6: 'https://buy.stripe.com/eVq9AL9kv46cgUWelU2Nq1W',
    full_15_x7: 'https://buy.stripe.com/8x27sDcwH9qwfQS2Dc2Nq1X',
    full_15_x8: 'https://buy.stripe.com/9B6aEP1S31Y48oqfpY2Nq1Y',
    full_15_x9: 'https://buy.stripe.com/8x2aEPfIT1Y40VYcdM2Nq1Z',
    full_15_x10: 'https://buy.stripe.com/9B6dR1dAL5agcEGa5E2Nq20',
    full_30_x1: 'https://buy.stripe.com/aFa7sDdALbyEfQSa5E2Nq21',
    full_30_x2: 'https://buy.stripe.com/eVq9AL0NZ9qw9su0v42Nq1y',
    full_30_x3: 'https://buy.stripe.com/00wdR17cn46c34691A2Nq22',
    full_30_x4: 'https://buy.stripe.com/cNi4grfITeKQdIKb9I2Nq23',
    full_30_x5: 'https://buy.stripe.com/28E5kvdAL6ek6gielU2Nq24',
    full_30_x6: 'https://buy.stripe.com/cNicMX8grcCI6gi0v42Nq25',
    full_30_x7: 'https://buy.stripe.com/3cI4gr0NZ7ioawy0v42Nq26',
    full_30_x8: 'https://buy.stripe.com/9B6dR1fIT7io2021z82Nq27',
    full_30_x9: 'https://buy.stripe.com/3cIaEPcwHbyE346gu22Nq28',
    full_30_x10: 'https://buy.stripe.com/14AbITfIT8ms9sudhQ2Nq29',
    full_45_x1: 'https://buy.stripe.com/fZubIT0NZ9qwfQS5Po2Nq2a',
    full_45_x2: 'https://buy.stripe.com/7sYbIT54f8ms48a5Po2Nq2b',
    full_45_x3: 'https://buy.stripe.com/4gM7sD9kvbyEcEG4Lk2Nq2c',
    full_45_x4: 'https://buy.stripe.com/7sYfZ91S3auA7km0v42Nq2d',
    full_45_x5: 'https://buy.stripe.com/cNi00b68j1Y48oqdhQ2Nq2e',
    full_45_x6: 'https://buy.stripe.com/5kQ3cnbsD8msfQS91A2Nq2f',
    full_45_x7: 'https://buy.stripe.com/4gM8wHaozdGM9su5Po2Nq2g',
    full_45_x8: 'https://buy.stripe.com/dRm7sDdALbyEfQS7Xw2Nq2h',
    full_45_x9: 'https://buy.stripe.com/00w7sDgMX9qw0VY3Hg2Nq2i',
    full_45_x10: 'https://buy.stripe.com/8x2fZ9aozauAeMOgu22Nq2j',
    full_60_x1: 'https://buy.stripe.com/aFabITbsDbyE9su4Lk2Nq2k',
    full_60_x2: 'https://buy.stripe.com/28E4gr40bcCIfQS2Dc2Nq2l',
    full_60_x3: 'https://buy.stripe.com/eVqdR19kv8ms9su2Dc2Nq2m',
    full_60_x4: 'https://buy.stripe.com/aFafZ968jbyE48ab9I2Nq2n',
    full_60_x5: 'https://buy.stripe.com/4gMbIT54fauAeMOa5E2Nq2o',
    full_60_x6: 'https://buy.stripe.com/dRmbIT68j5ag2027Xw2Nq2p',
    full_60_x7: 'https://buy.stripe.com/00waEPcwHfOU202dhQ2Nq2q',
    full_60_x8: 'https://buy.stripe.com/fZu28j2W7auAeMOb9I2Nq2r',
    full_60_x9: 'https://buy.stripe.com/eVqeV540bdGM7kmb9I2Nq2s',
    full_60_x10: 'https://buy.stripe.com/fZu7sDgMX328202elU2Nq2t',
    full_90_x1: 'https://buy.stripe.com/14A5kvfIT3287km7Xw2Nq2u',
    full_90_x2: 'https://buy.stripe.com/28EdR11S3auA8oq0v42Nq2v',
    full_90_x3: 'https://buy.stripe.com/4gM9ALfIT5ag6gidhQ2Nq2w',
    full_90_x4: 'https://buy.stripe.com/28EaEPeEP1Y448a4Lk2Nq2x',
    full_90_x5: 'https://buy.stripe.com/28EdR168j6ek9su6Ts2Nq2y',
    full_90_x6: 'https://buy.stripe.com/8x2eV5aoz8ms7km7Xw2Nq2z',
    full_90_x7: 'https://buy.stripe.com/eVq6oz2W79qwdIKelU2Nq2A',
    full_90_x8: 'https://buy.stripe.com/4gM5kvfITauA202gu22Nq2B',
    full_90_x9: 'https://buy.stripe.com/dRmbITdALauA48a1z82Nq2C',
    full_90_x10: 'https://buy.stripe.com/9B65kv8grfOUawy91A2Nq2D',
    full_120_x1: 'https://buy.stripe.com/bJe7sDgMX5ag48afpY2Nq2E',
    full_120_x2: 'https://buy.stripe.com/4gM6oz40bgSY9su4Lk2Nq2F',
    full_120_x3: 'https://buy.stripe.com/dRm4gr0NZeKQ5ce6Ts2Nq2G',
    full_120_x4: 'https://buy.stripe.com/bJe5kv54f46c6gielU2Nq2H',
    full_120_x5: 'https://buy.stripe.com/eVq4gr68j5ageMOelU2Nq2I',
    full_120_x6: 'https://buy.stripe.com/9B68wHeEPdGM7kmb9I2Nq2J',
    full_120_x7: 'https://buy.stripe.com/eVq14fcwH8ms0VY6Ts2Nq2K',
    full_120_x8: 'https://buy.stripe.com/28E9ALeEPauA8oqa5E2Nq2L',
    full_120_x9: 'https://buy.stripe.com/eVqaEP0NZgSY9sufpY2Nq2M',
    full_120_x10: 'https://buy.stripe.com/cNiaEPdAL6ekawydhQ2Nq2N',
    raw_15_x1: 'https://buy.stripe.com/cNi00b0NZcCI8oqdhQ2Nq2O',
    raw_15_x2: 'https://buy.stripe.com/aFabIT8grauAcEG5Po2Nq2P',
    raw_15_x3: 'https://buy.stripe.com/aFafZ9dAL1Y49su3Hg2Nq2Q',
    raw_15_x4: 'https://buy.stripe.com/14A00bfITgSYeMOelU2Nq2R',
    raw_15_x5: 'https://buy.stripe.com/bJe6ozbsD1Y4bAC3Hg2Nq2S',
    raw_15_x6: 'https://buy.stripe.com/6oU00bfITeKQbAC1z82Nq2T',
    raw_15_x7: 'https://buy.stripe.com/bJe28jgMX46cdIK7Xw2Nq2U',
    raw_15_x8: 'https://buy.stripe.com/5kQ5kv9kv5agbACb9I2Nq2V',
    raw_15_x9: 'https://buy.stripe.com/aFa14f9kv6ek5cegu22Nq2W',
    raw_15_x10: 'https://buy.stripe.com/4gM28j8gr1Y40VY6Ts2Nq2X',
    raw_30_x1: 'https://buy.stripe.com/6oUfZ940bauA2025Po2Nq2Y',
    raw_30_x2: 'https://buy.stripe.com/aFabIT54ffOU2026Ts2Nq2Z',
    raw_30_x3: 'https://buy.stripe.com/fZu9AL1S3cCI2025Po2Nq30',
    raw_30_x4: 'https://buy.stripe.com/eVqeV58grauA346elU2Nq31',
    raw_30_x5: 'https://buy.stripe.com/3cI28jbsD46c8oqb9I2Nq32',
    raw_30_x6: 'https://buy.stripe.com/eVqdR168jfOU8oq91A2Nq33',
    raw_30_x7: 'https://buy.stripe.com/00w4gr40bcCI20291A2Nq34',
    raw_30_x8: 'https://buy.stripe.com/cNi5kv54feKQawya5E2Nq35',
    raw_30_x9: 'https://buy.stripe.com/00wbIT0NZ9qwbAC5Po2Nq36',
    raw_30_x10: 'https://buy.stripe.com/6oUcMX54f1Y4dIKcdM2Nq37',
    raw_45_x1: 'https://buy.stripe.com/00wbIT0NZ7io9su0v42Nq38',
    raw_45_x2: 'https://buy.stripe.com/dRm8wHgMX0U06gib9I2Nq39',
    raw_45_x3: 'https://buy.stripe.com/cNi4gr1S346ceMO2Dc2Nq3a',
    raw_45_x4: 'https://buy.stripe.com/28E7sD0NZgSY5cecdM2Nq3b',
    raw_45_x5: 'https://buy.stripe.com/eVq4gr2W70U0dIKcdM2Nq3c',
    raw_45_x6: 'https://buy.stripe.com/aFa5kvcwHbyE48ab9I2Nq3d',
    raw_45_x7: 'https://buy.stripe.com/5kQ14faoz8ms9sugu22Nq3e',
    raw_45_x8: 'https://buy.stripe.com/aFa7sD0NZfOUawyb9I2Nq3f',
    raw_45_x9: 'https://buy.stripe.com/4gM8wH0NZ0U0dIKdhQ2Nq3g',
    raw_45_x10: 'https://buy.stripe.com/bJe3cncwH8msbACb9I2Nq3h',
    raw_60_x1: 'https://buy.stripe.com/6oU5kv40b1Y49su3Hg2Nq3i',
    raw_60_x2: 'https://buy.stripe.com/3cI4gr40bfOU5ce3Hg2Nq3j',
    raw_60_x3: 'https://buy.stripe.com/dRm9AL40b9qw346gu22Nq3k',
    raw_60_x4: 'https://buy.stripe.com/7sY4gr2W79qw9su2Dc2Nq3l',
    raw_60_x5: 'https://buy.stripe.com/8x2fZ9aoz1Y4eMO1z82Nq3m',
    raw_60_x6: 'https://buy.stripe.com/fZuaEP2W7auA8oqcdM2Nq3n',
    raw_60_x7: 'https://buy.stripe.com/9B600bgMX46cgUWelU2Nq3o',
    raw_60_x8: 'https://buy.stripe.com/fZu28j9kveKQawy91A2Nq3p',
    raw_60_x9: 'https://buy.stripe.com/4gMfZ90NZ328346b9I2Nq3q',
    raw_60_x10: 'https://buy.stripe.com/3cIcMX54feKQ5ce1z82Nq3r',
    raw_90_x1: 'https://buy.stripe.com/cNi4gr0NZgSY48a2Dc2Nq3s',
    raw_90_x2: 'https://buy.stripe.com/6oU4grcwH46c0VY4Lk2Nq3t',
    raw_90_x3: 'https://buy.stripe.com/dRm5kv0NZbyEdIKcdM2Nq3u',
    raw_90_x4: 'https://buy.stripe.com/6oUcMX40bfOU3466Ts2Nq3v',
    raw_90_x5: 'https://buy.stripe.com/dRm14fbsDauAcEGdhQ2Nq3w',
    raw_90_x6: 'https://buy.stripe.com/3cI14fbsDfOU3463Hg2Nq3x',
    raw_90_x7: 'https://buy.stripe.com/eVqfZ9fIT5ag8oqa5E2Nq3y',
    raw_90_x8: 'https://buy.stripe.com/6oUbIT0NZgSYgUW7Xw2Nq3z',
    raw_90_x9: 'https://buy.stripe.com/8x24graoz9qweMOdhQ2Nq3A',
    raw_90_x10: 'https://buy.stripe.com/cNiaEP8gr328dIK2Dc2Nq3B',
    raw_120_x1: 'https://buy.stripe.com/5kQ14f40b8msgUW5Po2Nq3C',
    raw_120_x2: 'https://buy.stripe.com/dRmaEPeEP46c0VYa5E2Nq3D',
    raw_120_x3: 'https://buy.stripe.com/9B65kvdAL8mseMO6Ts2Nq3E',
    raw_120_x4: 'https://buy.stripe.com/cNifZ97cndGM0VYgu22Nq3F',
    raw_120_x5: 'https://buy.stripe.com/00wfZ940beKQgUW6Ts2Nq3G',
    raw_120_x6: 'https://buy.stripe.com/00w4gr2W7auAeMOb9I2Nq3H',
    raw_120_x7: 'https://buy.stripe.com/00wdR168jcCI8oqelU2Nq3I',
    raw_120_x8: 'https://buy.stripe.com/fZu9AL54f1Y47km5Po2Nq3J',
    raw_120_x9: 'https://buy.stripe.com/cNi9ALgMX9qw6gidhQ2Nq3K',
    raw_120_x10: 'https://buy.stripe.com/cNicMXaoz5ag2021z82Nq3L'
  });

  // Counts that have a fixed-quantity link. 0 means none.
  const VIDEO_COUNTS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const CLIP_COUNTS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 40, 50, 75, 100]);

  /** Nearest allowed b-roll count (ties round up). */
  function snapClips(value) {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n <= 0) return 0;
    let best = CLIP_COUNTS[0];
    for (const c of CLIP_COUNTS) if (Math.abs(c - n) < Math.abs(best - n) || (Math.abs(c - n) === Math.abs(best - n) && c > best)) best = c;
    return best;
  }
  /** Next or previous allowed b-roll count from the current one. */
  function stepClips(current, dir) {
    const i = CLIP_COUNTS.indexOf(snapClips(current));
    return CLIP_COUNTS[Math.min(CLIP_COUNTS.length - 1, Math.max(0, i + (dir > 0 ? 1 : -1)))];
  }

  const LIMITS = Object.freeze({
    minQty: 0,
    maxQty: 10,
    minClips: 0,
    maxClips: 100,
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
   * quantity (videos) 0-10 and clips from CLIP_COUNTS; at least one must be above zero.
   * length and type only matter when quantity > 0.
   * Returns { ok, error, lines, total, linkKey, checkouts: [{key, linkKey, url, amount, quantity, stripeName}], summary }.
   */
  function quote(order) {
    const o = order || {};
    const quantity = Number(o.quantity);
    const clips = Number(o.clips);
    if (!isInt(quantity) || quantity < LIMITS.minQty || quantity > LIMITS.maxQty) {
      return { ok: false, error: `Choose between ${LIMITS.minQty} and ${LIMITS.maxQty} videos.` };
    }
    if (!isInt(clips) || !CLIP_COUNTS.includes(clips)) {
      return { ok: false, error: 'Choose 1 to 10 b-roll clips, or 15, 20, 25, 30, 40, 50, 75, or 100.' };
    }
    if (quantity === 0 && clips === 0) return { ok: false, error: 'Add at least one video or one b-roll clip.' };

    const lines = [];
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
      lines[lines.length - 1].linkKey = `${o.type}_${length}_x${quantity}`;
    }
    if (clips > 0) {
      lines.push({ key: 'broll', label: 'B-roll clip', unitPrice: BROLL_CLIP_PRICE, quantity: clips, subtotal: BROLL_CLIP_PRICE * clips, stripeName: 'UGC B-roll Clip', linkKey: `broll_x${clips}` });
    }
    const total = lines.reduce((sum, l) => sum + l.subtotal, 0);
    // One Stripe checkout per line, videos first. Each link has the exact quantity built in.
    const checkouts = lines.map(l => ({ key: l.key, linkKey: l.linkKey, url: PAYMENT_LINKS[l.linkKey] || '', amount: l.subtotal, quantity: l.quantity, stripeName: l.stripeName }));
    if (checkouts.some(c => !c.url)) return { ok: false, error: 'Online checkout is not available for this combination.' };
    const linkKey = checkouts.map(c => c.linkKey).join('+');
    const summary = lines.map(l => (l.key === 'broll' ? plural(l.quantity, 'b-roll clip', 'b-roll clips') : `${l.quantity} × ${l.label}${l.quantity === 1 ? '' : 's'}`)).join(' + ');
    return { ok: true, lines, total, linkKey, checkouts, summary };
  }

  /** URL of the first checkout for this order ('' if none). */
  function paymentLink(order) {
    const q = quote(order);
    return q.ok ? q.checkouts[0].url : '';
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

  return { FULL_PRICES, RAW_PRICES, LENGTHS, BROLL_CLIP_PRICE, TYPES, LIMITS, PAYMENT_LINKS, VIDEO_COUNTS, CLIP_COUNTS, snapClips, stepClips, REF_RE, quote, paymentLink, validateBrief, isEmail, isHttpUrl, money };
});
