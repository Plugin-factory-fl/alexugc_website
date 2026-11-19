/*
 * Turns a wizard order into Google Form responses for "UGC Creative Brief | Alex Miller".
 * The form's "Script or creative directions" answer is capped at 3,000 characters,
 * so long briefs are split into numbered parts that share one order reference.
 * Loaded in the browser (window.UGCBrief) and by local tests (require).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.UGCBrief = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FORM_ACTION = 'https://docs.google.com/forms/d/e/1FAIpQLSei67lcSfxrYHIJpJu3xVFBtnc1INO2vJ2ySxGfWfLOYCd5Hw/formResponse';
  const ENTRY = Object.freeze({
    orderType: 'entry.2147031447',
    reference: 'entry.2069755540',
    name: 'entry.354187871',
    email: 'entry.86149281',
    brand: 'entry.1526207630',
    videos: 'entry.698467984',
    directions: 'entry.1314869938',
    link: 'entry.1529610763'
  });
  const ORDER_TYPE = 'Custom length and quantity';
  const NAME_PLACEHOLDER = 'Website order (name not asked)';
  const BRAND_PLACEHOLDER = 'See Stripe checkout';
  const PART_LIMIT = 3000;
  const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function pad(n) { return String(n).padStart(2, '0'); }

  /** Order reference like UGC-261110-K7Q2MZ4H (date + 8 random characters). */
  function newReference(now, randomBytes) {
    const d = now || new Date();
    let bytes = randomBytes;
    if (!bytes) {
      bytes = new Uint8Array(8);
      const c = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto : null;
      if (c) c.getRandomValues(bytes);
      else for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    let rand = '';
    for (let i = 0; i < 8; i++) rand += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
    return `UGC-${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${rand}`;
  }

  function header(ref, part, count, b, q, P) {
    if (part > 1) return `Order reference: ${ref}\nPart ${part} of ${count} (continued)\n\n`;
    const lines = [
      `Order reference: ${ref}`,
      `Part 1 of ${count}`,
      `Submitted from alexugcpro.com/order`,
      `Order: ${q.summary}`
    ];
    q.lines.forEach(l => lines.push(`- ${l.label}: ${l.quantity} × ${P.money(l.unitPrice)} = ${P.money(l.subtotal)}`));
    lines.push(`Expected Stripe total: ${P.money(q.total)}`);
    lines.push(`Ship a physical product to Alex: ${b.physical === 'yes' ? 'Yes' : 'No'}`);
    if (b.scriptFileName) lines.push(`Script file: ${b.scriptFileName}`);
    if (b.scriptLink) lines.push(`Script link: ${b.scriptLink}`);
    return lines.join('\n') + '\n\n';
  }

  function body(b) {
    const blocks = [];
    blocks.push(`SCRIPT:\n${(b.scriptText || '').trim() || '(none provided)'}`);
    blocks.push(`ADDITIONAL DETAILS:\n${(b.details || '').trim() || '(none)'}`);
    if ((b.detailLinks || '').trim()) blocks.push(`REFERENCE LINKS:\n${b.detailLinks.trim()}`);
    return blocks.join('\n\n');
  }

  /** Split text into pieces of at most `size` characters, preferring line breaks. */
  function chunk(text, size) {
    const out = [];
    let rest = text;
    while (rest.length > size) {
      let cut = rest.lastIndexOf('\n', size);
      if (cut < size * 0.6) cut = rest.lastIndexOf(' ', size);
      if (cut < size * 0.6) cut = size;
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut).replace(/^\n/, '');
    }
    out.push(rest);
    return out;
  }

  /**
   * Build the directions text for each form response.
   * Returns an array of strings, each at most PART_LIMIT characters.
   */
  function directionParts(ref, b, q, P) {
    const text = body(b);
    // Header length depends on the part count, so size for the worst case first.
    for (let count = 1; count < 20; count++) {
      const firstRoom = PART_LIMIT - header(ref, 1, count, b, q, P).length;
      const laterRoom = PART_LIMIT - header(ref, 2, count, b, q, P).length;
      const first = chunk(text, firstRoom);
      const pieces = [first[0]];
      const remaining = first.length > 1 ? text.slice(first[0].length).replace(/^\n/, '') : '';
      if (remaining) pieces.push(...chunk(remaining, laterRoom));
      if (pieces.length === count) return pieces.map((p, i) => header(ref, i + 1, count, b, q, P) + p);
    }
    throw new Error('Brief too long');
  }

  /** Returns an array of URLSearchParams bodies, one per form response. */
  function formBodies(ref, b, P) {
    const q = P.quote(b);
    if (!q.ok) throw new Error(q.error);
    return directionParts(ref, b, q, P).map((directions, i) => {
      const f = new URLSearchParams();
      f.set(ENTRY.orderType, ORDER_TYPE);
      f.set(ENTRY.reference, ref);
      f.set(ENTRY.name, NAME_PLACEHOLDER);
      f.set(ENTRY.email, b.email.trim());
      f.set(ENTRY.brand, BRAND_PLACEHOLDER);
      if (Number(b.quantity) > 0) f.set(ENTRY.videos, String(Number(b.quantity)));
      f.set(ENTRY.directions, directions);
      if (i === 0 && b.scriptLink) f.set(ENTRY.link, b.scriptLink.trim());
      f.set('fvv', '1');
      f.set('pageHistory', '0');
      return f;
    });
  }

  return { FORM_ACTION, ENTRY, PART_LIMIT, newReference, formBodies, directionParts, chunk };
});
