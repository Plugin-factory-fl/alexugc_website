(() => {
'use strict';

/**
 * Static order page: Google Forms brief + Stripe Payment Links.
 * Static page only: no server, no .env, and no Stripe or Google API keys in this site.
 * Prefill uses only non-sensitive values: order reference, order type, video length, and count.
 */

// Custom unit prices in USD; quantity never changes the per-video rate.
const DURATION_PRICES = { 15: 80, 30: 100, 45: 100, 60: 120, 90: 150, 120: 160 };

// One Stripe Payment Link per duration, with adjustable quantity from 1 to 100.
const CUSTOM_CHECKOUT_LINKS = {
  15: 'https://buy.stripe.com/9B6cMX1S3eKQfQS6Ts2Nq0R',
  30: 'https://buy.stripe.com/6oU00bcwH3285cegu22Nq0W',
  45: 'https://buy.stripe.com/7sY6oz2W79qw0VYdhQ2Nq0S',
  60: 'https://buy.stripe.com/bJe5kv9kvgSY5ceb9I2Nq0T',
  90: 'https://buy.stripe.com/7sYdR140bcCI0VYgu22Nq0V',
  120: 'https://buy.stripe.com/dRm3cnaozauAdIKgu22Nq0U'
};

const PACKAGES = {
  starter: { name: 'The Starter', videos: 1, price: 90, url: 'https://buy.stripe.com/5kQ8wHfIT46ceMOgu22Nq0t' },
  growth:  { name: 'The Growth',  videos: 3, price: 250, url: 'https://buy.stripe.com/28E4grdAL3285ce6Ts2Nq0u' },
  scale:   { name: 'The Scale',   videos: 5, price: 420, url: 'https://buy.stripe.com/bJe4graoz8ms48a6Ts2Nq0v' }
};

// Public Google Form view URL with verified non-sensitive prefill entry ids.
// Never prefill name, email, brand, script, or shared links.
const google = {
  formBaseUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSei67lcSfxrYHIJpJu3xVFBtnc1INO2vJ2ySxGfWfLOYCd5Hw/viewform',
  entries: {
    reference: 'entry.2069755540',
    orderType: 'entry.2147031447',
    selection: 'entry.1383629738',
    videos: 'entry.698467984'
  }
};

const FORM_ORDER_TYPE = {
  custom: 'Custom length and quantity',
  starter: 'The Starter: 1 video, $90',
  growth: 'The Growth: 3 videos, $250',
  scale: 'The Scale: 5 videos, $420'
};

const DURATIONS = Object.keys(DURATION_PRICES).map(Number);
const SESSION_KEY = 'ugc-order-session';
const REF_PATTERN = /^UGC-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const $ = (q, ctx = document) => ctx.querySelector(q);
const $$ = (q, ctx = document) => [...ctx.querySelectorAll(q)];

const state = {
  mode: 'custom', // 'package' | 'custom'
  packageId: null,
  duration: 15,
  quantity: 1
};

let activeReference = '';
let activeSelectionKey = '';

function isPlaceholder(url) {
  return !url || /pending/i.test(url);
}

function unitPrice() {
  return DURATION_PRICES[state.duration];
}

function totalPrice(qty) {
  return unitPrice() * qty;
}

function formatMoney(n) {
  return `$${n.toLocaleString('en-US')}`;
}

function linkForCustom() {
  return CUSTOM_CHECKOUT_LINKS[state.duration] || null;
}

function paymentLink() {
  if (state.mode === 'package' && state.packageId && PACKAGES[state.packageId]) {
    return PACKAGES[state.packageId].url;
  }
  return linkForCustom();
}

function formConfigured() {
  const base = String(google.formBaseUrl || '').trim();
  if (!base) return false;
  try {
    const url = new URL(base);
    const pathOk = url.hostname === 'docs.google.com'
      ? /\/forms\/d\/e\/[A-Za-z0-9_-]+\/viewform\/?$/.test(url.pathname)
      : url.hostname === 'forms.gle';
    return url.protocol === 'https:'
      && pathOk
      && !url.searchParams.has('usp')
      && !url.username
      && !url.password;
  } catch (_) {
    return false;
  }
}

function selectionForForm() {
  if (state.mode === 'package' && state.packageId && FORM_ORDER_TYPE[state.packageId]) {
    return FORM_ORDER_TYPE[state.packageId];
  }
  return FORM_ORDER_TYPE.custom;
}

function lengthForForm() {
  if (state.mode === 'package' && state.packageId && PACKAGES[state.packageId]) {
    return 'Fixed package';
  }
  const price = DURATION_PRICES[state.duration];
  return `${state.duration} seconds: $${price} per video`;
}

function videosForForm() {
  if (state.mode === 'package' && state.packageId && PACKAGES[state.packageId]) {
    return String(PACKAGES[state.packageId].videos);
  }
  return String(state.quantity);
}

function createReference() {
  const cryptoObj = (typeof window !== 'undefined' && window.crypto) || (typeof crypto !== 'undefined' ? crypto : null);
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return 'UGC-' + cryptoObj.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `UGC-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function selectionDetails() {
  if (state.mode === 'package' && state.packageId && PACKAGES[state.packageId]) {
    const pkg = PACKAGES[state.packageId];
    return {
      orderType: 'package',
      package: state.packageId,
      selection: `${pkg.name} · ${pkg.videos} video${pkg.videos === 1 ? '' : 's'}`,
      videos: String(pkg.videos),
      total: String(pkg.price)
    };
  }
  return {
    orderType: 'custom',
    duration: String(state.duration),
    selection: `${state.duration}s · ${state.quantity} video${state.quantity === 1 ? '' : 's'}`,
    videos: String(state.quantity),
    total: String(totalPrice(state.quantity))
  };
}

function selectionKey() {
  return JSON.stringify(selectionDetails());
}

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.mode === 'package' && PACKAGES[data.packageId]) {
      state.mode = 'package';
      state.packageId = data.packageId;
    } else if (data.mode === 'custom') {
      state.mode = 'custom';
      state.packageId = null;
    }
    if (DURATIONS.includes(data.duration)) state.duration = data.duration;
    if (Number.isFinite(data.quantity) && data.quantity >= 1 && data.quantity <= 100) {
      state.quantity = Math.floor(data.quantity);
    }
    if (typeof data.reference === 'string' && REF_PATTERN.test(data.reference) && data.selectionKey === selectionKey()) {
      activeReference = data.reference;
      activeSelectionKey = data.selectionKey;
    }
  } catch (_) { /* private browsing or corrupt session */ }
}

function writeSession() {
  try {
    if (typeof window !== 'undefined' && window.location && window.history) {
      const params = new URLSearchParams();
      if (state.mode === 'package' && state.packageId) {
        params.set('mode', 'package');
        params.set('package', state.packageId);
      } else {
        params.set('mode', 'custom');
        params.set('duration', String(state.duration));
        params.set('qty', String(state.quantity));
      }
      const next = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
      window.history.replaceState(null, '', next);
    }
  } catch (_) { /* non-browser or restricted history */ }

  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        mode: state.mode,
        packageId: state.packageId,
        duration: state.duration,
        quantity: state.quantity,
        reference: activeReference,
        selectionKey: activeSelectionKey
      }));
    }
  } catch (_) { /* private browsing */ }
}

function readQuery() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const pkg = params.get('package');
  const duration = Number(params.get('duration'));
  const quantity = Number(params.get('qty'));

  if (mode === 'package' && pkg && PACKAGES[pkg]) {
    state.mode = 'package';
    state.packageId = pkg;
  } else if (mode === 'custom' || duration || quantity) {
    state.mode = 'custom';
    state.packageId = null;
  }
  if (DURATIONS.includes(duration)) state.duration = duration;
  if (Number.isFinite(quantity) && quantity >= 1 && quantity <= 100) {
    state.quantity = Math.floor(quantity);
  }
}

function resetBriefConfirmation() {
  const checkbox = $('#brief-submitted');
  if (checkbox) checkbox.checked = false;
}

function ensureReference() {
  const key = selectionKey();
  if (key !== activeSelectionKey || !REF_PATTERN.test(activeReference)) {
    activeSelectionKey = key;
    activeReference = createReference();
    resetBriefConfirmation();
  }
  return activeReference;
}

function buildGoogleFormUrl() {
  if (!formConfigured()) return null;
  try {
    const url = new URL(google.formBaseUrl);
    // Strip tracking params; keep only validated path + our non-sensitive prefills.
    url.search = '';
    const values = {
      reference: activeReference,
      orderType: selectionForForm(),
      selection: lengthForForm(),
      videos: videosForForm()
    };
    for (const [name, entryId] of Object.entries(google.entries || {})) {
      const id = String(entryId || '').trim();
      if (!/^entry\.\d+$/.test(id)) continue;
      if (values[name] === undefined || values[name] === '') continue;
      url.searchParams.set(id, values[name]);
    }
    return url.href;
  } catch (_) {
    return null;
  }
}

function setMode(mode, packageId = null) {
  resetBriefConfirmation();
  state.mode = mode;
  state.packageId = packageId;
  ensureReference();
  writeSession();
  render();
}

function setDuration(duration) {
  if (duration !== state.duration || state.mode !== 'custom') resetBriefConfirmation();
  state.duration = duration;
  state.mode = 'custom';
  state.packageId = null;
  ensureReference();
  writeSession();
  render();
}

function setQuantity(qty) {
  const next = Math.min(100, Math.max(1, Math.floor(qty) || 1));
  if (next !== state.quantity || state.mode !== 'custom') resetBriefConfirmation();
  state.quantity = next;
  state.mode = 'custom';
  state.packageId = null;
  ensureReference();
  writeSession();
  render();
}

function renderPackageCards() {
  $$('[data-package]').forEach(card => {
    const id = card.dataset.package;
    const selected = state.mode === 'package' && state.packageId === id;
    card.classList.toggle('is-selected', selected);
    const button = $(`[data-select-package="${id}"]`);
    if (button) button.setAttribute('aria-pressed', String(selected));
  });
}

function renderDuration() {
  $$('[data-duration]').forEach(btn => {
    const value = Number(btn.dataset.duration);
    const price = DURATION_PRICES[value];
    const label = btn.querySelector('.order-duration-label');
    const priceEl = btn.querySelector('.order-duration-price');
    if (label) label.textContent = `${value} seconds`;
    if (priceEl) priceEl.textContent = `${formatMoney(price)} per video`;
    if (!label && !priceEl) btn.textContent = `${value}s · ${formatMoney(price)}`;
    const selected = state.mode === 'custom' && state.duration === value;
    btn.classList.toggle('is-selected', selected);
    btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
}

function renderQuantity() {
  const input = $('#order-qty');
  const display = $('#order-qty-display');
  if (input) input.value = String(state.quantity);
  if (display) display.textContent = String(state.quantity);
  const minus = $('#qty-minus');
  const plus = $('#qty-plus');
  if (minus) minus.disabled = state.quantity <= 1;
  if (plus) plus.disabled = state.quantity >= 100;
}

function renderSummary() {
  const summaryMode = $('#summary-mode');
  const summaryDetail = $('#summary-detail');
  const summaryUnit = $('#summary-unit');
  const summaryTotal = $('#summary-total');
  const priceLive = $('#price-live');
  const qtyNote = $('#qty-checkout-note');

  if (state.mode === 'package' && state.packageId && PACKAGES[state.packageId]) {
    const pkg = PACKAGES[state.packageId];
    if (summaryMode) summaryMode.textContent = pkg.name;
    if (summaryDetail) summaryDetail.textContent = `${pkg.videos} video${pkg.videos === 1 ? '' : 's'} · fixed package`;
    if (summaryUnit) summaryUnit.textContent = formatMoney(pkg.price);
    if (summaryTotal) summaryTotal.textContent = formatMoney(pkg.price);
    if (priceLive) {
      priceLive.textContent = `${pkg.name}: ${formatMoney(pkg.price)} for ${pkg.videos} video${pkg.videos === 1 ? '' : 's'}. Submit your Google Forms brief, then continue to payment.`;
    }
    if (qtyNote) {
      qtyNote.textContent = 'Your selected package price is fixed. Submit your brief before paying, and paste the same order reference in Stripe.';
    }
    return;
  }

  const qty = state.quantity;
  const unit = unitPrice();
  const total = totalPrice(qty);

  if (summaryMode) summaryMode.textContent = 'Custom length builder';
  if (summaryDetail) summaryDetail.textContent = `${state.duration}s · ${qty} video${qty === 1 ? '' : 's'} · estimate`;
  if (summaryUnit) summaryUnit.textContent = `${formatMoney(unit)} each`;
  if (summaryTotal) summaryTotal.textContent = formatMoney(total);
  if (priceLive) {
    priceLive.textContent = `Estimate ${formatMoney(total)} for ${qty} × ${state.duration}s video${qty === 1 ? '' : 's'} at ${formatMoney(unit)} each.`;
  }
  if (qtyNote) {
    qtyNote.textContent = `Set your final quantity (1-100) in Stripe at ${formatMoney(unit)} per ${state.duration}s video. Paste the same order reference in Stripe.`;
  }
}

function setDisabledAnchor(el, disabled, href) {
  if (!el) return;
  el.classList.toggle('is-disabled', disabled);
  el.setAttribute('aria-disabled', String(disabled));
  if (disabled) {
    el.removeAttribute('href');
    el.setAttribute('tabindex', '-1');
  } else if (href) {
    el.href = href;
    el.removeAttribute('tabindex');
  }
}

function renderBriefFlow() {
  ensureReference();
  writeSession();

  const referenceEl = $('#brief-reference');
  if (referenceEl) referenceEl.textContent = activeReference;

  const formLink = $('#open-brief-form');
  const checkout = $('#custom-checkout');
  const pending = $('#checkout-pending');
  const formReady = formConfigured();
  const formUrl = formReady ? buildGoogleFormUrl() : null;
  const payUrl = paymentLink();
  const payReady = Boolean(payUrl && !isPlaceholder(payUrl));
  const confirmed = Boolean($('#brief-submitted')?.checked);

  if (formLink) {
    formLink.hidden = false;
    formLink.dataset.formRequired = 'true';
    if (formReady && formUrl) {
      setDisabledAnchor(formLink, false, formUrl);
      formLink.removeAttribute('title');
    } else {
      setDisabledAnchor(formLink, true);
      formLink.title = 'Google Form link will appear here once the public form URL is configured.';
    }
  }

  if (pending) {
    pending.hidden = formReady;
    pending.dataset.formRequired = 'true';
  }

  if (checkout) {
    checkout.dataset.formRequired = 'true';
    // Payment stays hidden until the brief confirmation checkbox is checked.
    const expose = formReady && payReady && confirmed;
    checkout.hidden = !expose;
    if (expose) setDisabledAnchor(checkout, false, payUrl);
    else setDisabledAnchor(checkout, true);
  }
}

function render() {
  renderPackageCards();
  renderDuration();
  renderQuantity();
  renderSummary();
  renderBriefFlow();
  const builder = $('#custom-builder');
  if (builder) builder.classList.toggle('is-active', state.mode === 'custom');
}

async function copyReference() {
  const feedback = $('#reference-feedback');
  const text = activeReference;
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
    } else {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
    if (feedback) feedback.textContent = 'Order reference copied. Paste it in Google Forms and again in Stripe.';
  } catch (_) {
    if (feedback) feedback.textContent = 'Select and copy the order reference shown above.';
    const code = $('#brief-reference');
    if (code && window.getSelection) {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
}

function bind() {
  $$('[data-select-package]').forEach(button => {
    button.addEventListener('click', () => {
      setMode('package', button.dataset.selectPackage);
      $('#order-brief-flow')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  $('#brief-submitted')?.addEventListener('change', renderBriefFlow);
  $('#copy-brief-reference')?.addEventListener('click', () => { copyReference(); });

  $('#open-brief-form')?.addEventListener('click', event => {
    if (event.currentTarget.getAttribute('aria-disabled') === 'true') event.preventDefault();
  });
  $('#custom-checkout')?.addEventListener('click', event => {
    if (event.currentTarget.getAttribute('aria-disabled') === 'true') event.preventDefault();
  });

  $$('[data-duration]').forEach(btn => {
    btn.addEventListener('click', () => setDuration(Number(btn.dataset.duration)));
  });

  $('#qty-minus')?.addEventListener('click', () => setQuantity(state.quantity - 1));
  $('#qty-plus')?.addEventListener('click', () => setQuantity(state.quantity + 1));
  $('#order-qty')?.addEventListener('change', e => setQuantity(Number(e.target.value)));
  $('#order-qty')?.addEventListener('input', e => {
    const val = Number(e.target.value);
    if (Number.isFinite(val)) setQuantity(val);
  });

  $('#choose-custom')?.addEventListener('click', () => {
    resetBriefConfirmation();
    state.mode = 'custom';
    state.packageId = null;
    ensureReference();
    writeSession();
    render();
    $('#order-brief-flow')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const menuButton = $('.menu-toggle');
  const nav = $('#navlinks');
  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const open = menuButton.getAttribute('aria-expanded') === 'true';
      menuButton.setAttribute('aria-expanded', String(!open));
      nav.classList.toggle('open', !open);
    });
    $$('a', nav).forEach(a => a.addEventListener('click', () => {
      menuButton.setAttribute('aria-expanded', 'false');
      nav.classList.remove('open');
    }));
  }

  const year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());
}

function init() {
  readSession();
  readQuery();
  ensureReference();
  bind();
  render();
}

if (typeof document !== 'undefined' && document.querySelector) {
  init();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DURATION_PRICES,
    CUSTOM_CHECKOUT_LINKS,
    PACKAGES,
    google,
    createReference,
    REF_PATTERN,
    formConfigured,
    buildGoogleFormUrl,
    selectionDetails,
    selectionForForm,
    lengthForForm,
    videosForForm,
    FORM_ORDER_TYPE,
    unitPrice,
    totalPrice,
    state,
    ensureReference,
    renderBriefFlow,
    render,
    resetBriefConfirmation
  };
}
})();
