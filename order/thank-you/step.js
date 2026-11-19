(() => {
  'use strict';
  // Orders with videos and b-roll are paid in two Stripe checkouts. After checkout 1
  // (videos) Stripe returns here; show checkout 2 (b-roll). B-roll links return with
  // ?paid=broll, which means the order is complete.
  const KEY = 'ugc-order-pending-v1';
  const REF_RE = /^UGC-[0-9]{6}-[A-Z0-9]{8}$/;
  let pending = null;
  try { pending = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (_) { pending = null; }
  const params = new URLSearchParams(window.location.search);
  if (params.get('paid') === 'broll' || !pending) {
    try { sessionStorage.removeItem(KEY); } catch (_) { /* ignore */ }
  } else if (typeof pending.url === 'string' && /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+$/.test(pending.url) && REF_RE.test(pending.ref || '')) {
    const box = document.getElementById('broll-step');
    document.getElementById('broll-step-qty').textContent = String(Number(pending.quantity) || '');
    document.getElementById('broll-step-amount').textContent = '$' + Number(pending.amount || 0).toLocaleString('en-US');
    document.getElementById('broll-step-link').href = `${pending.url}?client_reference_id=${encodeURIComponent(pending.ref)}`;
    document.getElementById('thanks-title').textContent = 'Videos paid. One more step.';
    box.hidden = false;
  }
  if (params.toString()) {
    try { window.history.replaceState(null, '', window.location.pathname); } catch (_) { /* ignore */ }
  }
})();
