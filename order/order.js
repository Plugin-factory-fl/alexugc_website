(() => {
'use strict';

/*
 * One-question-at-a-time UGC order wizard.
 * Answers live only in this tab's sessionStorage until checkout. They are sent
 * once, by POST, to the checkout API, which creates a Stripe Checkout Session.
 * Nothing from the brief is put in URLs, analytics, or console logs.
 */

const P = window.UGCPricing;
const STORE_KEY = 'ugc-order-wizard-v1';
const $ = (q, ctx = document) => ctx.querySelector(q);
const $$ = (q, ctx = document) => [...ctx.querySelectorAll(q)];
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const track = (name, params) => { try { if (typeof window.ugcTrack === 'function') window.ugcTrack(name, params); } catch (_) { /* ignore */ } };

const DEFAULTS = {
  step: 'videos',
  quantity: 1,
  length: 15,
  type: '',
  clips: 5,
  scriptText: '',
  scriptLink: '',
  scriptFileName: '',
  physical: '',
  details: '',
  detailLinks: '',
  email: ''
};
const state = { ...DEFAULTS };
let busy = false;

function steps() {
  const list = ['videos', 'type'];
  if (state.type === 'broll') list.push('clips');
  list.push('script', 'physical', 'details', 'email', 'review');
  return list;
}

function clampInt(value, min, max, fallback) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// ---------- persistence ----------
function save() {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) { /* private mode */ }
}
function load() {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    const L = P.LIMITS;
    state.quantity = clampInt(d.quantity, L.minQty, L.maxQty, DEFAULTS.quantity);
    state.length = P.LENGTHS.includes(Number(d.length)) ? Number(d.length) : DEFAULTS.length;
    state.type = P.TYPES[d.type] ? d.type : '';
    state.clips = clampInt(d.clips, L.minClips, L.maxClips, DEFAULTS.clips);
    state.scriptText = typeof d.scriptText === 'string' ? d.scriptText.slice(0, L.script) : '';
    state.scriptLink = typeof d.scriptLink === 'string' ? d.scriptLink.slice(0, L.scriptLink) : '';
    state.scriptFileName = typeof d.scriptFileName === 'string' ? d.scriptFileName.slice(0, L.fileName) : '';
    state.physical = d.physical === 'yes' || d.physical === 'no' ? d.physical : '';
    state.details = typeof d.details === 'string' ? d.details.slice(0, L.details) : '';
    state.detailLinks = typeof d.detailLinks === 'string' ? d.detailLinks.slice(0, L.detailLinks) : '';
    state.email = typeof d.email === 'string' ? d.email.slice(0, L.email) : '';
    state.step = steps().includes(d.step) ? d.step : 'videos';
  } catch (_) { /* corrupt or unavailable */ }
}
function clearSaved() {
  try { sessionStorage.removeItem(STORE_KEY); } catch (_) { /* ignore */ }
}

// ---------- state -> form ----------
function fillForm() {
  $('#field-quantity').value = String(state.quantity);
  $$('input[name="length"]').forEach(r => { r.checked = Number(r.value) === state.length; });
  $$('input[name="type"]').forEach(r => { r.checked = r.value === state.type; });
  $('#field-clips').value = String(state.clips);
  $('#field-script-text').value = state.scriptText;
  $('#field-script-link').value = state.scriptLink;
  $$('input[name="physical"]').forEach(r => { r.checked = r.value === state.physical; });
  $('#field-details').value = state.details;
  $('#field-detail-links').value = state.detailLinks;
  $('#field-email').value = state.email;
  if (state.scriptFileName) $('#file-status').textContent = `Added from ${state.scriptFileName}.`;
}

function currentQuote() {
  return P.quote({ type: state.type || 'completed', length: state.length, quantity: state.quantity, clips: state.clips });
}

function updateLive() {
  const vq = P.quote({ type: 'completed', length: state.length, quantity: state.quantity });
  $('#estimate-videos').textContent = vq.ok ? `${state.quantity} × ${state.length}s video${state.quantity === 1 ? '' : 's'} = ${P.money(vq.total)}` : '';
  const cq = P.quote({ type: 'broll', clips: state.clips });
  $('#estimate-clips').textContent = cq.ok ? `${state.clips} clip${state.clips === 1 ? '' : 's'} × ${P.money(P.BROLL_CLIP_PRICE)} = ${P.money(cq.total)}` : '';
  const len = state.scriptText.length;
  const sc = $('#script-count');
  sc.textContent = `${len.toLocaleString('en-US')} / ${P.LIMITS.script.toLocaleString('en-US')} characters${len >= P.LIMITS.script ? ' (limit reached)' : ''}`;
  sc.classList.toggle('is-limit', len >= P.LIMITS.script);
  const dl = state.details.length;
  $('#details-count').textContent = `${dl.toLocaleString('en-US')} / ${P.LIMITS.details.toLocaleString('en-US')} characters`;
  $('#shipping-note').hidden = state.physical !== 'yes';
  $$('[data-qty-step="-1"]').forEach(b => { b.disabled = state.quantity <= P.LIMITS.minQty; });
  $$('[data-qty-step="1"]').forEach(b => { b.disabled = state.quantity >= P.LIMITS.maxQty; });
  $$('[data-clips-step="-1"]').forEach(b => { b.disabled = state.clips <= P.LIMITS.minClips; });
  $$('[data-clips-step="1"]').forEach(b => { b.disabled = state.clips >= P.LIMITS.maxClips; });
}

// ---------- review ----------
function addRow(dl, label, value) {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  dl.append(dt, dd);
}
function renderReview() {
  const dl = $('#review-list');
  dl.textContent = '';
  const q = currentQuote();
  addRow(dl, 'Content', P.TYPES[state.type] ? P.TYPES[state.type].label : 'Not chosen');
  if (state.type === 'broll') {
    addRow(dl, 'Clips', `${state.clips} × ${P.money(P.BROLL_CLIP_PRICE)}`);
  } else {
    addRow(dl, 'Videos', `${state.quantity} × ${state.length}s at ${P.money(P.LENGTH_PRICES[state.length])} each`);
  }
  const scriptParts = [];
  if (state.scriptText.trim()) scriptParts.push(`${state.scriptText.length.toLocaleString('en-US')} characters pasted`);
  if (state.scriptLink.trim()) scriptParts.push('link added');
  if (state.scriptFileName) scriptParts.push(`from ${state.scriptFileName}`);
  addRow(dl, 'Script', scriptParts.length ? scriptParts.join(', ') : 'None yet');
  addRow(dl, 'Ship a product to Alex', state.physical === 'yes' ? 'Yes' : state.physical === 'no' ? 'No' : 'Not answered');
  addRow(dl, 'Additional details', state.details.trim() || state.detailLinks.trim() ? 'Added' : 'None');
  addRow(dl, 'Email', state.email);
  $('#review-total').textContent = q.ok ? P.money(q.total) : '—';
}

// ---------- step rendering ----------
function stepEl(name) { return $(`.wizard-card[data-step="${name}"]`); }

function renderChrome() {
  const list = steps();
  const i = list.indexOf(state.step);
  const total = list.length;
  $('#wizard-step-count').textContent = state.step === 'review' ? 'Final step: review' : `Step ${i + 1} of ${total}`;
  $('#wizard-progress-bar').style.width = `${Math.round(((i + 1) / total) * 100)}%`;
  $('#wizard-back').hidden = i === 0;
  const next = $('#wizard-next');
  if (state.step === 'review') next.innerHTML = 'Checkout securely <span aria-hidden="true">↗</span>';
  else if (state.step === 'email') next.innerHTML = 'Review order <span aria-hidden="true">→</span>';
  else next.innerHTML = 'Next <span aria-hidden="true">→</span>';
  if (state.step === 'review') renderReview();
}

function showOnly(name) {
  $$('.wizard-card').forEach(card => {
    const on = card.dataset.step === name;
    card.hidden = !on;
    card.classList.remove('is-entering-forward', 'is-entering-back', 'is-leaving-forward', 'is-leaving-back');
    if (on) card.removeAttribute('inert'); else card.setAttribute('inert', '');
  });
}

function focusStep(name) {
  const heading = $(`.wizard-card[data-step="${name}"] .wizard-question`);
  if (heading) heading.focus({ preventScroll: true });
  const wizard = $('#order-wizard');
  const rect = wizard.getBoundingClientRect();
  if (rect.top < 0 || rect.top > window.innerHeight * 0.4) wizard.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
}

function goTo(name, direction) {
  const from = state.step;
  if (from === name) return;
  state.step = name;
  save();
  const out = stepEl(from);
  const into = stepEl(name);
  const dir = direction === 'back' ? 'back' : 'forward';
  track('order_step', { step: name, step_index: steps().indexOf(name) + 1 });

  if (reduceMotion() || !out || !into) {
    showOnly(name);
    renderChrome();
    focusStep(name);
    return;
  }
  busy = true;
  out.classList.add(`is-leaving-${dir}`);
  const finish = () => {
    if (!busy) return;
    showOnly(name);
    renderChrome();
    into.classList.add(`is-entering-${dir}`);
    focusStep(name);
    busy = false;
  };
  out.addEventListener('animationend', finish, { once: true });
  setTimeout(finish, 320); // fallback if animations are disabled
}

// ---------- validation per step ----------
function setError(id, msg, field) {
  const el = $(id);
  if (el) el.textContent = msg || '';
  if (field) {
    if (msg) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  }
}

function validateStep(name) {
  switch (name) {
    case 'videos': {
      state.quantity = clampInt($('#field-quantity').value, P.LIMITS.minQty, P.LIMITS.maxQty, 1);
      $('#field-quantity').value = String(state.quantity);
      return true;
    }
    case 'type': {
      if (!P.TYPES[state.type]) { setError('#error-type', 'Choose one option to continue.'); $('input[name="type"]').focus(); return false; }
      setError('#error-type', '');
      return true;
    }
    case 'clips': {
      state.clips = clampInt($('#field-clips').value, P.LIMITS.minClips, P.LIMITS.maxClips, 1);
      $('#field-clips').value = String(state.clips);
      return true;
    }
    case 'script': {
      const field = $('#field-script-link');
      const v = field.value.trim();
      if (v && !P.isHttpUrl(v)) { setError('#error-script-link', 'Enter a full link that starts with https://', field); field.focus(); return false; }
      setError('#error-script-link', '', field);
      state.scriptLink = v;
      return true;
    }
    case 'physical': {
      if (state.physical !== 'yes' && state.physical !== 'no') { setError('#error-physical', 'Choose yes or no to continue.'); $('input[name="physical"]').focus(); return false; }
      setError('#error-physical', '');
      return true;
    }
    case 'email': {
      const field = $('#field-email');
      const v = field.value.trim();
      if (!P.isEmail(v)) { setError('#error-email', 'Enter a valid email address, like you@yourbrand.com.', field); field.focus(); return false; }
      setError('#error-email', '', field);
      state.email = v;
      return true;
    }
    default:
      return true;
  }
}

function next() {
  if (busy) return;
  if (state.step === 'review') { checkout(); return; }
  if (!validateStep(state.step)) return;
  save();
  const list = steps();
  const i = list.indexOf(state.step);
  if (i < list.length - 1) goTo(list[i + 1], 'forward');
}

function back() {
  if (busy) return;
  const list = steps();
  const i = list.indexOf(state.step);
  if (i > 0) goTo(list[i - 1], 'back');
}

// ---------- script file ----------
async function onFile(event) {
  const input = event.target;
  const status = $('#file-status');
  const file = input.files && input.files[0];
  if (!file) return;
  const okType = /\.(txt|md|markdown)$/i.test(file.name) || /^text\//.test(file.type);
  if (!okType) {
    status.textContent = 'That file type cannot be read here. Upload it to Google Drive or Dropbox and paste the share link above.';
    input.value = '';
    return;
  }
  if (file.size > 200 * 1024) {
    status.textContent = 'That file is too large. Paste a share link instead.';
    input.value = '';
    return;
  }
  try {
    const text = (await file.text()).replace(/\r\n?/g, '\n');
    const area = $('#field-script-text');
    const combined = area.value.trim() ? `${area.value}\n\n${text}` : text;
    const limited = combined.slice(0, P.LIMITS.script);
    area.value = limited;
    state.scriptText = limited;
    state.scriptFileName = file.name.slice(0, P.LIMITS.fileName);
    status.textContent = combined.length > P.LIMITS.script
      ? `Added from ${file.name}, trimmed to the 5,000 character limit. Paste a link if your script is longer.`
      : `Added from ${file.name}. Review it in the box below.`;
    save();
    updateLive();
  } catch (_) {
    status.textContent = 'That file could not be read. Paste the script or a link instead.';
  }
  input.value = '';
}

// ---------- checkout ----------
function endpoint() {
  const base = String(window.UGC_CHECKOUT_ENDPOINT || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(base) ? `${base}/api/checkout` : '';
}

async function checkout() {
  const err = $('#error-checkout');
  err.textContent = '';
  const v = P.validateBrief({ ...state });
  if (!v.ok) {
    err.textContent = 'Something is missing. Use Back to check your answers.';
    return;
  }
  const url = endpoint();
  if (!url) {
    err.textContent = 'Online checkout is not available right now. Email alexanderlmiller500@gmail.com to order, or use Fiverr or Upwork below.';
    return;
  }
  const button = $('#wizard-next');
  busy = true;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = 'Opening secure checkout…';
  track('begin_checkout', { checkout_provider: 'stripe', currency: 'USD', value: v.quote.total, order_type: state.type });

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => controller && controller.abort(), 75000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: state.type,
        length: state.length,
        quantity: state.quantity,
        clips: state.clips,
        scriptText: state.scriptText,
        scriptLink: state.scriptLink,
        scriptFileName: state.scriptFileName,
        physical: state.physical,
        details: state.details,
        detailLinks: state.detailLinks,
        email: state.email,
        website: $('#field-website').value,
        expectedTotal: v.quote.total
      }),
      signal: controller ? controller.signal : undefined,
      credentials: 'omit'
    });
    const data = await res.json().catch(() => ({}));
    // Only follow Stripe-hosted checkout URLs (local tests may opt in to a mock URL).
    const okUrl = res.ok && typeof data.url === 'string'
      && (/^https:\/\/checkout\.stripe\.com\//.test(data.url) || window.UGC_ALLOW_TEST_CHECKOUT_URL === true);
    if (okUrl) {
      save();
      window.location.assign(data.url);
      return;
    }
    err.textContent = res.status === 429
      ? 'Too many attempts. Please wait a few minutes and try again.'
      : 'Checkout could not open. Please try again, or email alexanderlmiller500@gmail.com.';
  } catch (_) {
    err.textContent = 'Checkout could not be reached. Check your connection and try again.';
  } finally {
    clearTimeout(timer);
  }
  busy = false;
  button.disabled = false;
  button.removeAttribute('aria-busy');
  renderChrome();
}

// ---------- events ----------
function bind() {
  const form = $('#wizard-form');
  form.addEventListener('submit', e => { e.preventDefault(); next(); });
  $('#wizard-back').addEventListener('click', back);
  $('#wizard-restart').addEventListener('click', () => {
    clearSaved();
    Object.assign(state, DEFAULTS);
    fillForm();
    $('#file-status').textContent = '';
    $$('.wizard-error').forEach(e => { e.textContent = ''; });
    updateLive();
    showOnly('videos');
    renderChrome();
    focusStep('videos');
  });

  form.addEventListener('input', e => {
    const t = e.target;
    switch (t.name) {
      case 'quantity': if (t.value !== '') state.quantity = clampInt(t.value, P.LIMITS.minQty, P.LIMITS.maxQty, state.quantity); break;
      case 'clips': if (t.value !== '') state.clips = clampInt(t.value, P.LIMITS.minClips, P.LIMITS.maxClips, state.clips); break;
      case 'scriptText':
        if (t.value.length > P.LIMITS.script) t.value = t.value.slice(0, P.LIMITS.script);
        state.scriptText = t.value; break;
      case 'scriptLink':
        state.scriptLink = t.value.trim();
        if (!state.scriptLink || P.isHttpUrl(state.scriptLink)) setError('#error-script-link', '', t);
        break;
      case 'details':
        if (t.value.length > P.LIMITS.details) t.value = t.value.slice(0, P.LIMITS.details);
        state.details = t.value; break;
      case 'detailLinks': state.detailLinks = t.value.slice(0, P.LIMITS.detailLinks); break;
      case 'email': state.email = t.value.trim(); if (P.isEmail(state.email)) setError('#error-email', '', t); break;
      default: break;
    }
    save();
    updateLive();
  });
  form.addEventListener('change', e => {
    const t = e.target;
    if (t.name === 'length') state.length = Number(t.value);
    if (t.name === 'type') { state.type = t.value; setError('#error-type', ''); }
    if (t.name === 'physical') { state.physical = t.value; setError('#error-physical', ''); }
    if (t.name === 'quantity') { state.quantity = clampInt(t.value, P.LIMITS.minQty, P.LIMITS.maxQty, 1); t.value = String(state.quantity); }
    if (t.name === 'clips') { state.clips = clampInt(t.value, P.LIMITS.minClips, P.LIMITS.maxClips, 1); t.value = String(state.clips); }
    save();
    updateLive();
  });
  $$('[data-qty-step]').forEach(b => b.addEventListener('click', () => {
    state.quantity = clampInt(state.quantity + Number(b.dataset.qtyStep), P.LIMITS.minQty, P.LIMITS.maxQty, 1);
    $('#field-quantity').value = String(state.quantity);
    save(); updateLive();
  }));
  $$('[data-clips-step]').forEach(b => b.addEventListener('click', () => {
    state.clips = clampInt(state.clips + Number(b.dataset.clipsStep), P.LIMITS.minClips, P.LIMITS.maxClips, 1);
    $('#field-clips').value = String(state.clips);
    save(); updateLive();
  }));
  $('#field-script-file').addEventListener('change', onFile);

  // Picking a choice card with Enter moves on, like pressing Next.
  form.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('input[type="radio"]')) { e.preventDefault(); next(); }
  });

  const menuButton = $('.menu-toggle');
  const nav = $('#navlinks');
  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const open = menuButton.getAttribute('aria-expanded') === 'true';
      menuButton.setAttribute('aria-expanded', String(!open));
      nav.classList.toggle('open', !open);
    });
  }
  const year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());
}

function init() {
  if (!P || !$('#order-wizard')) return;
  load();
  const params = new URLSearchParams(window.location.search);
  const canceled = params.get('checkout') === 'canceled';
  if (canceled && P.validateBrief({ ...state }).ok) state.step = 'review';
  if (params.toString()) {
    try { window.history.replaceState(null, '', window.location.pathname + window.location.hash); } catch (_) { /* ignore */ }
  }
  fillForm();
  bind();
  updateLive();
  showOnly(state.step);
  renderChrome();
  $('#order-wizard').dataset.state = 'ready';
  if (canceled) {
    $('#error-checkout').textContent = 'Checkout was canceled. Your answers are saved, so you can try again whenever you are ready.';
  }
}

init();
})();
