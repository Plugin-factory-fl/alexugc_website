// Local test: runs the service against a mock Stripe API. No real Stripe calls.
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { briefMetadata, briefFromMetadata, briefText, cleanBrief, verifyStripeSignature } from './orders.mjs';

const AMOUNTS = { price_1UaGUY0A1ZGjwd5gqBRzrbG4: 8000, price_1UaGUZ0A1ZGjwd5gKfZ2X44n: 10000, price_1UaGUa0A1ZGjwd5gT2dNyi6A: 10000, price_1UaGUc0A1ZGjwd5gppy5Cfcf: 12000, price_1UaGUf0A1ZGjwd5ga1jeGie4: 15000, price_1UaGUh0A1ZGjwd5gf6e3DEG1: 16000, price_1UaGH30A1ZGjwd5g2xQ7dQv0: 6400, price_1UaGH90A1ZGjwd5gd2qooZh8: 8000, price_1UaGHB0A1ZGjwd5gGCKz2X86: 8000, price_1UaGHE0A1ZGjwd5gFfcF7RTz: 9600, price_1UaGHG0A1ZGjwd5g4S3SEZly: 12000, price_1UaGHJ0A1ZGjwd5gJJG1EzIm: 12800, price_1UaGHL0A1ZGjwd5gAbzrTMUt: 700 };
const sessions = [];
const emails = [];
const forms = [];
const LINE_ITEMS = { data: [{ description: 'Full-Service UGC Video, 30 seconds', quantity: 2, price: { unit_amount: 10000 }, amount_subtotal: 20000, amount_total: 0 }, { description: 'UGC B-roll Clip', quantity: 10, price: { unit_amount: 700 }, amount_subtotal: 7000, amount_total: 0 }] };
const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    const m = req.url.match(/^\/v1\/prices\/(\w+)/);
    if (m) { const a = AMOUNTS[m[1]]; if (!a) { res.writeHead(404); return res.end('{"error":{"message":"no"}}'); } return res.end(JSON.stringify({ id: m[1], active: true, type: 'one_time', currency: 'usd', unit_amount: a })); }
    if (/^\/v1\/checkout\/sessions\/[^/]+\/line_items/.test(req.url)) return res.end(JSON.stringify(LINE_ITEMS));
    if (req.url === '/emails') { emails.push({ key: req.headers['idempotency-key'], auth: req.headers.authorization, body: JSON.parse(b) }); return res.end('{"id":"em_1"}'); }
    if (req.url === '/form') { forms.push(new URLSearchParams(b)); res.setHeader('Content-Type', 'text/html'); return res.end('ok'); }
    if (req.url === '/v1/checkout/sessions') {
      const p = new URLSearchParams(b); sessions.push(p);
      let total = 0; for (let i = 0; p.get(`line_items[${i}][price]`); i++) total += AMOUNTS[p.get(`line_items[${i}][price]`)] * Number(p.get(`line_items[${i}][quantity]`));
      return res.end(JSON.stringify({ id: 'cs_test', url: 'https://checkout.stripe.com/c/pay/cs_test_x', amount_total: total, amount_subtotal: total }));
    }
    res.writeHead(404); res.end('{}');
  });
});
await new Promise(r => mock.listen(18999, r));
const child = spawn(process.execPath, ['checkout-server.mjs'], { env: { ...process.env, PORT: '18998', RATE_LIMIT: '1000', STRIPE_WEBHOOK_SECRET: 'whsec_test_secret', RESEND_API_KEY: 're_test_key', NOTIFY_FROM: 'Alex UGC Orders <orders@example.com>', RESEND_API_BASE: 'http://127.0.0.1:18999', FORM_ACTION_URL: 'http://127.0.0.1:18999/form', STRIPE_SECRET_KEY: 'rk_mock_not_real', STRIPE_API_BASE: 'http://127.0.0.1:18999' }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => child.stdout.on('data', d => { if (String(d).includes('prices verified')) r(); }));
const O = 'https://alexugcpro.com';
const post = (body, origin = O) => fetch('http://127.0.0.1:18998/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, cors: r.headers.get('access-control-allow-origin'), json: await r.json() }));
const ref = 'UGC-261119-ABCD1234';
try {
  let r = await (await fetch('http://127.0.0.1:18998/health')).json();
  assert.equal(r.configured, true); assert.equal(r.pricesVerified, true);
  r = await post({ type: 'full', length: 30, quantity: 2, clips: 10, ref });
  assert.equal(r.status, 200); assert.equal(r.cors, O); assert.match(r.json.url, /^https:\/\/checkout\.stripe\.com\//);
  const s = sessions.at(-1);
  assert.equal(s.get('mode'), 'payment'); assert.equal(s.get('client_reference_id'), ref);
  assert.equal(s.get('line_items[0][price]'), 'price_1UaGUZ0A1ZGjwd5gKfZ2X44n'); assert.equal(s.get('line_items[0][quantity]'), '2');
  assert.equal(s.get('line_items[1][price]'), 'price_1UaGHL0A1ZGjwd5gAbzrTMUt'); assert.equal(s.get('line_items[1][quantity]'), '10');
  assert.equal(s.get('line_items[0][adjustable_quantity][enabled]'), null);
  assert.equal(s.get('success_url'), 'https://alexugcpro.com/order/thank-you/');
  assert.equal(s.get('cancel_url'), 'https://alexugcpro.com/order/?checkout=canceled');
  assert.equal(s.get('metadata[expected_total_cents]'), '27000');
  assert.equal(s.get('customer_email'), null);
  assert.match(s.get('custom_text[submit][message]'), /Delivery in 5 to 7 days by email as a Google Drive link, unless we agree otherwise\. If your order needs more time, I will email you personally\.$/);
  assert.ok(s.get('custom_text[submit][message]').length <= 1200);
  assert.equal(s.get('allow_promotion_codes'), 'true');
  r = await post({ type: 'full', length: 30, quantity: 1, ref, email: '  buyer.test@example.com ' }); assert.equal(r.status, 200); assert.equal(sessions.at(-1).get('customer_email'), 'buyer.test@example.com');
  for (const badEmail of ['not an email', 'a@b', 'x@y.c', 'a b@c.com', '<a@b.com>', 'a'.repeat(250) + '@example.com', 42, null]) {
    r = await post({ type: 'full', length: 30, quantity: 1, ref, email: badEmail }); assert.equal(r.status, 200, String(badEmail)); assert.equal(sessions.at(-1).get('customer_email'), null, String(badEmail));
  }
  r = await post({ quantity: 0, clips: 200, ref }); assert.equal(r.status, 200); assert.equal(sessions.at(-1).get('line_items[0][quantity]'), '200');
  r = await post({ type: 'raw', length: 120, quantity: 50, clips: 0, ref }); assert.equal(r.status, 200); assert.equal(sessions.at(-1).get('line_items[1][price]'), null);
  for (const bad of [{ type: 'full', length: 30, quantity: 51, ref }, { quantity: 0, clips: 201, ref }, { quantity: 0, clips: 0, ref }, { type: 'full', length: 31, quantity: 1, ref }, { type: 'pet', length: 30, quantity: 1, ref }, { type: 'full', length: 30, quantity: 1.5, ref }, { type: 'full', length: 30, quantity: 1, ref: 'x' }, { type: 'full', length: 30, quantity: -1, clips: 5, ref }, { type: 'full', length: 30, quantity: 1, ref, price: 'price_hack' }]) {
    const n = sessions.length; r = await post(bad);
    if (bad.price) { assert.equal(r.status, 200); assert.equal(sessions.at(-1).get('line_items[0][price]'), 'price_1UaGUZ0A1ZGjwd5gKfZ2X44n'); continue; }
    assert.equal(r.status, 400, JSON.stringify(bad)); assert.equal(sessions.length, n);
  }
  r = await post({ type: 'full', length: 30, quantity: 1, ref }, 'https://evil.example'); assert.equal(r.status, 403); assert.equal(r.cors, null);
  r = await post({ type: 'full', length: 30, quantity: 1, ref }, 'https://www.alexugcpro.com'); assert.equal(r.status, 200);
  // ---- brief storage ----
  const big = cleanBrief({ scriptText: 'S'.repeat(6000), scriptLink: 'https://docs.google.com/x', details: 'D'.repeat(2500), detailLinks: 'https://a.com', physical: 'yes', scriptFileName: 'f.txt', junk: 'x' });
  assert.equal(big.scriptText.length, 5000); assert.equal(big.details.length, 2000); assert.equal(big.junk, undefined);
  assert.equal(cleanBrief({ scriptLink: 'javascript:alert(1)' }).scriptLink, '');
  const meta = briefMetadata(briefText(big));
  assert.ok(Object.keys(meta).length <= 42); assert.ok(Object.values(meta).every(v => v.length <= 500));
  assert.equal(briefFromMetadata(meta), briefText(big)); assert.equal(meta.brief_truncated, 'no');
  const huge = briefMetadata('x'.repeat(30000)); assert.equal(huge.brief_truncated, 'yes'); assert.ok(Number(huge.brief_parts) <= 38); assert.match(briefFromMetadata(huge), /Brief truncated/);
  // checkout stores the brief on the session metadata, not on the payment
  r = await post({ type: 'full', length: 30, quantity: 2, clips: 10, ref, email: 'buyer.test@example.com', brief: { scriptText: 'Hook line SCRIPTMARK', details: 'Spring sale', physical: 'no', detailLinks: 'https://ref.example/1' } });
  assert.equal(r.status, 200);
  let cs = sessions.at(-1);
  const keys = [...cs.keys()].filter(k => k.startsWith('metadata['));
  assert.ok(keys.length <= 50, String(keys.length));
  const stored = {}; for (const k of keys) stored[k.slice(9, -1)] = cs.get(k);
  assert.match(briefFromMetadata(stored), /SCRIPTMARK[\s\S]*Spring sale[\s\S]*ref\.example/);
  assert.ok(![...cs.keys()].some(k => k.startsWith('payment_intent_data[metadata][brief')));
  const exp = Number(cs.get('expires_at')) - Math.floor(Date.now() / 1000); assert.ok(exp > 3500 && exp <= 3600, String(exp));
  // ---- signature ----
  const now = Math.floor(Date.now() / 1000);
  const sign = (payload, secret = 'whsec_test_secret', t = now) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;
  assert.equal(verifyStripeSignature('{}', sign('{}'), 'whsec_test_secret'), true);
  assert.equal(verifyStripeSignature('{}', sign('{}', 'whsec_other'), 'whsec_test_secret'), false);
  assert.equal(verifyStripeSignature('{}', sign('{}', 'whsec_test_secret', now - 1000), 'whsec_test_secret'), false);
  assert.equal(verifyStripeSignature('{"a":1}', sign('{}'), 'whsec_test_secret'), false);
  // ---- webhook ----
  const hook = (event, sig) => { const raw = JSON.stringify(event); return fetch('http://127.0.0.1:18998/api/stripe-webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig || sign(raw) }, body: raw }).then(async x => ({ status: x.status, json: await x.json() })); };
  const sessionObj = (id, extra = {}) => ({ id, object: 'checkout.session', status: 'complete', payment_status: 'no_payment_required', client_reference_id: ref, customer_details: { email: 'buyer.test@example.com' }, custom_fields: [{ key: 'brand_name', text: { value: 'Acme Co' } }], amount_subtotal: 27000, amount_total: 0, total_details: { amount_discount: 27000 }, metadata: stored, ...extra });
  let w = await hook({ id: 'evt_bad', type: 'checkout.session.completed', data: { object: sessionObj('cs_x') } }, 't=1,v1=00');
  assert.equal(w.status, 400); assert.equal(emails.length, 0);
  const done = { id: 'evt_1', type: 'checkout.session.completed', data: { object: sessionObj('cs_paid_1') } };
  w = await hook(done); assert.equal(w.status, 200, JSON.stringify(w.json)); assert.equal(w.json.email, 'sent'); assert.equal(w.json.form, true);
  assert.equal(emails.length, 1);
  const em = emails[0];
  assert.equal(em.key, 'ugc-paid-cs_paid_1'); assert.equal(em.auth, 'Bearer re_test_key'); assert.deepEqual(em.body.to, ['alexanderlmiller500@gmail.com']);
  assert.equal(em.body.subject, `New UGC order ${ref} ($0.00)`);
  for (const want of ['buyer.test@example.com', 'Acme Co', '2 x Full-Service UGC Video, 30 seconds at $100.00 = $200.00', '10 x UGC B-roll Clip', 'Subtotal: $270.00', 'Discount (promo code): -$270.00', 'Total paid: $0.00', 'Delivery in 5 to 7 days by email as a Google Drive link', 'SCRIPTMARK', 'Spring sale', 'https://ref.example/1']) assert.ok(em.body.text.includes(want), want);
  assert.ok(forms.length >= 1); assert.equal(forms.at(-1).get('entry.354187871'), 'PAID ORDER'); assert.match(forms.at(-1).get('entry.1314869938'), /^STATUS: PAID ORDER \(total paid \$0\.00\)/); assert.equal(forms.at(-1).get('entry.2069755540'), ref); assert.equal(forms.at(-1).get('entry.1526207630'), 'Acme Co');
  const formsAfterPaid = forms.length;
  w = await hook({ ...done, id: 'evt_1_retry' }); assert.equal(w.status, 200); assert.equal(emails.length, 1); assert.equal(forms.length, formsAfterPaid);
  w = await hook({ id: 'evt_2', type: 'checkout.session.expired', data: { object: sessionObj('cs_abandoned_1', { status: 'expired', payment_status: 'unpaid', customer_details: null, customer_email: 'buyer.test@example.com', custom_fields: [], amount_total: 27000, total_details: { amount_discount: 0 } }) } });
  assert.equal(w.status, 200); assert.equal(emails.length, 1);
  assert.equal(forms.at(-1).get('entry.354187871'), 'ABANDONED CHECKOUT (not paid)'); assert.match(forms.at(-1).get('entry.1314869938'), /^STATUS: ABANDONED CHECKOUT/); assert.match(forms.at(-1).get('entry.1314869938'), /SCRIPTMARK/);
  const n2 = forms.length;
  w = await hook({ id: 'evt_3', type: 'checkout.session.completed', data: { object: sessionObj('cs_megamix', { metadata: { plan: 'pro' } }) } });
  assert.equal(w.json.ignored, 'not a UGC order'); assert.equal(forms.length, n2); assert.equal(emails.length, 1);
  w = await hook({ id: 'evt_4', type: 'customer.created', data: { object: {} } }); assert.equal(w.json.ignored, 'type');
  w = await hook({ id: 'evt_5', type: 'checkout.session.completed', data: { object: sessionObj('cs_unpaid', { payment_status: 'unpaid' }) } }); assert.equal(w.json.ignored, 'not paid yet'); assert.equal(emails.length, 1);
  r = await (await fetch('http://127.0.0.1:18998/health')).json(); assert.equal(r.webhook, true); assert.equal(r.email, true);
  console.log('server tests passed');
} finally { child.kill(); mock.close(); }
