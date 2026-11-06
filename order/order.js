(() => {
'use strict';

/**
 * Custom checkout links by duration (seconds).
 * Live Stripe Payment Links by duration.
 * - single: fixed quantity 1 at $100
 * - bundle: adjustable quantity 2..100 at $85 each (final qty set in Stripe)
 */
const CUSTOM_CHECKOUT_LINKS = {
  15:  { single: 'https://buy.stripe.com/28EdR1aoz7io3464Lk2Nq0w', bundle: 'https://buy.stripe.com/4gM7sDaozgSYgUWgu22Nq0x' },
  30:  { single: 'https://buy.stripe.com/14AaEP1S36ekbAC3Hg2Nq0A', bundle: 'https://buy.stripe.com/aFa6oz54f1Y48oq5Po2Nq0y' },
  45:  { single: 'https://buy.stripe.com/5kQ28jgMX1Y49su6Ts2Nq0z', bundle: 'https://buy.stripe.com/bJeaEP9kv3285ce5Po2Nq0B' },
  60:  { single: 'https://buy.stripe.com/00w6ozfIT32848agu22Nq0C', bundle: 'https://buy.stripe.com/cNi5kv7cn1Y49su91A2Nq0D' },
  90:  { single: 'https://buy.stripe.com/6oU4greEPgSYeMO7Xw2Nq0E', bundle: 'https://buy.stripe.com/dRmdR1fITgSYbAC1z82Nq0F' },
  120: { single: 'https://buy.stripe.com/cNieV5gMXgSY3462Dc2Nq0G', bundle: 'https://buy.stripe.com/9B6eV5aoz3289sub9I2Nq0H' }
};

const PACKAGES = {
  starter: { name: 'The Starter', videos: 1, price: 90, url: 'https://buy.stripe.com/5kQ8wHfIT46ceMOgu22Nq0t' },
  growth:  { name: 'The Growth',  videos: 3, price: 250, url: 'https://buy.stripe.com/28E4grdAL3285ce6Ts2Nq0u' },
  scale:   { name: 'The Scale',   videos: 5, price: 420, url: 'https://buy.stripe.com/bJe4graoz8ms48a6Ts2Nq0v' }
};

const SINGLE_PRICE = 100;
const BUNDLE_UNIT = 85;
const DURATIONS = [15, 30, 45, 60, 90, 120];
const STORAGE_KEY = 'ugc-order-selection';

const $ = (q, ctx = document) => ctx.querySelector(q);
const $$ = (q, ctx = document) => [...ctx.querySelectorAll(q)];

const state = {
  mode: 'custom', // 'package' | 'custom'
  packageId: null,
  duration: 30,
  quantity: 1
};

function isPlaceholder(url) {
  return !url || /pending/i.test(url);
}

function unitPrice(qty) {
  return qty <= 1 ? SINGLE_PRICE : BUNDLE_UNIT;
}

function totalPrice(qty) {
  return unitPrice(qty) * qty;
}

function formatMoney(n) {
  return `$${n.toLocaleString('en-US')}`;
}

function linkForCustom() {
  const entry = CUSTOM_CHECKOUT_LINKS[state.duration];
  if (!entry) return null;
  return state.quantity <= 1 ? entry.single : entry.bundle;
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

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.mode === 'package' && PACKAGES[data.packageId]) {
      state.mode = 'package';
      state.packageId = data.packageId;
    }
    if (data.mode === 'custom') {
      state.mode = 'custom';
      state.packageId = null;
    }
    if (DURATIONS.includes(data.duration)) state.duration = data.duration;
    if (Number.isFinite(data.quantity) && data.quantity >= 1 && data.quantity <= 100) {
      state.quantity = Math.floor(data.quantity);
    }
  } catch (_) { /* ignore */ }
}

function writeSelection() {
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

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: state.mode,
      packageId: state.packageId,
      duration: state.duration,
      quantity: state.quantity
    }));
  } catch (_) { /* ignore */ }
}

function setMode(mode, packageId = null) {
  state.mode = mode;
  state.packageId = packageId;
  writeSelection();
  render();
}

function setDuration(duration) {
  state.duration = duration;
  state.mode = 'custom';
  state.packageId = null;
  writeSelection();
  render();
}

function setQuantity(qty) {
  const next = Math.min(100, Math.max(1, Math.floor(qty) || 1));
  state.quantity = next;
  state.mode = 'custom';
  state.packageId = null;
  writeSelection();
  render();
}

function renderPackageCards() {
  $$('[data-package]').forEach(card => {
    const id = card.dataset.package;
    const selected = state.mode === 'package' && state.packageId === id;
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
}

function renderDuration() {
  $$('[data-duration]').forEach(btn => {
    const value = Number(btn.dataset.duration);
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
  const checkout = $('#custom-checkout');
  const pending = $('#checkout-pending');
  const qtyNote = $('#qty-checkout-note');

  if (state.mode === 'package' && state.packageId && PACKAGES[state.packageId]) {
    const pkg = PACKAGES[state.packageId];
    if (summaryMode) summaryMode.textContent = pkg.name;
    if (summaryDetail) summaryDetail.textContent = `${pkg.videos} video${pkg.videos === 1 ? '' : 's'} · fixed package`;
    if (summaryUnit) summaryUnit.textContent = formatMoney(pkg.price);
    if (summaryTotal) summaryTotal.textContent = formatMoney(pkg.price);
    if (priceLive) {
      priceLive.textContent = `${pkg.name}: ${formatMoney(pkg.price)} for ${pkg.videos} video${pkg.videos === 1 ? '' : 's'}. Use the package button to check out.`;
    }
    if (checkout) {
      checkout.hidden = true;
      checkout.removeAttribute('href');
      checkout.setAttribute('aria-disabled', 'true');
    }
    if (pending) pending.hidden = true;
    if (qtyNote) qtyNote.textContent = 'Package checkout opens Stripe directly from the package card.';
    return;
  }

  const qty = state.quantity;
  const unit = unitPrice(qty);
  const total = totalPrice(qty);
  const link = linkForCustom();
  const ready = link && !isPlaceholder(link);

  if (summaryMode) summaryMode.textContent = 'Custom length builder';
  if (summaryDetail) {
    summaryDetail.textContent = `${state.duration}s · ${qty} video${qty === 1 ? '' : 's'} · estimate`;
  }
  if (summaryUnit) summaryUnit.textContent = `${formatMoney(unit)} each`;
  if (summaryTotal) summaryTotal.textContent = formatMoney(total);
  if (priceLive) {
    priceLive.textContent = qty === 1
      ? `Estimate ${formatMoney(total)} for 1 × ${state.duration}s video at ${formatMoney(SINGLE_PRICE)}.`
      : `Estimate ${formatMoney(total)} for ${qty} × ${state.duration}s videos at ${formatMoney(BUNDLE_UNIT)} each (${formatMoney(BUNDLE_UNIT)} × ${qty}).`;
  }

  if (qtyNote) {
    qtyNote.textContent = qty === 1
      ? 'Stripe locks quantity at 1 for a single video. Enter brand, script, and optional shared links before payment.'
      : 'Stripe starts multi-video checkout at quantity 2. Set your final quantity there (2 to 100). The exact total is calculated in Stripe. Enter brand, script, and optional shared links before payment.';
  }

  if (checkout && pending) {
    if (ready) {
      checkout.hidden = false;
      checkout.href = link;
      checkout.removeAttribute('aria-disabled');
      checkout.classList.remove('is-disabled');
      pending.hidden = true;
    } else {
      checkout.hidden = true;
      checkout.removeAttribute('href');
      checkout.setAttribute('aria-disabled', 'true');
      checkout.classList.add('is-disabled');
      pending.hidden = false;
    }
  }
}

function render() {
  renderPackageCards();
  renderDuration();
  renderQuantity();
  renderSummary();
  const builder = $('#custom-builder');
  if (builder) builder.classList.toggle('is-active', state.mode === 'custom');
}

function bind() {
  $$('[data-package]').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('a')) return;
      setMode('package', card.dataset.package);
    });
  });

  $$('[data-duration]').forEach(btn => {
    btn.addEventListener('click', () => setDuration(Number(btn.dataset.duration)));
  });

  $('#qty-minus')?.addEventListener('click', () => setQuantity(state.quantity - 1));
  $('#qty-plus')?.addEventListener('click', () => setQuantity(state.quantity + 1));
  $('#order-qty')?.addEventListener('change', e => setQuantity(Number(e.target.value)));
  $('#order-qty')?.addEventListener('input', e => {
    const val = Number(e.target.value);
    if (Number.isFinite(val)) {
      state.quantity = Math.min(100, Math.max(1, Math.floor(val) || 1));
      renderQuantity();
      renderSummary();
    }
  });

  $('#choose-custom')?.addEventListener('click', () => {
    state.mode = 'custom';
    state.packageId = null;
    writeSelection();
    render();
    $('#custom-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

readStorage();
readQuery();
bind();
render();
})();
