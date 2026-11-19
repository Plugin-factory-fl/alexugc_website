// Local test: runs the service against a mock Stripe API. No real Stripe calls.
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const AMOUNTS = { price_1UaGUY0A1ZGjwd5gqBRzrbG4: 8000, price_1UaGUZ0A1ZGjwd5gKfZ2X44n: 10000, price_1UaGUa0A1ZGjwd5gT2dNyi6A: 10000, price_1UaGUc0A1ZGjwd5gppy5Cfcf: 12000, price_1UaGUf0A1ZGjwd5ga1jeGie4: 15000, price_1UaGUh0A1ZGjwd5gf6e3DEG1: 16000, price_1UaGH30A1ZGjwd5g2xQ7dQv0: 6400, price_1UaGH90A1ZGjwd5gd2qooZh8: 8000, price_1UaGHB0A1ZGjwd5gGCKz2X86: 8000, price_1UaGHE0A1ZGjwd5gFfcF7RTz: 9600, price_1UaGHG0A1ZGjwd5g4S3SEZly: 12000, price_1UaGHJ0A1ZGjwd5gJJG1EzIm: 12800, price_1UaGHL0A1ZGjwd5gAbzrTMUt: 700 };
const sessions = [];
const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    const m = req.url.match(/^\/v1\/prices\/(\w+)/);
    if (m) { const a = AMOUNTS[m[1]]; if (!a) { res.writeHead(404); return res.end('{"error":{"message":"no"}}'); } return res.end(JSON.stringify({ id: m[1], active: true, type: 'one_time', currency: 'usd', unit_amount: a })); }
    if (req.url === '/v1/checkout/sessions') {
      const p = new URLSearchParams(b); sessions.push(p);
      let total = 0; for (let i = 0; p.get(`line_items[${i}][price]`); i++) total += AMOUNTS[p.get(`line_items[${i}][price]`)] * Number(p.get(`line_items[${i}][quantity]`));
      return res.end(JSON.stringify({ id: 'cs_test', url: 'https://checkout.stripe.com/c/pay/cs_test_x', amount_total: total }));
    }
    res.writeHead(404); res.end('{}');
  });
});
await new Promise(r => mock.listen(18999, r));
const child = spawn(process.execPath, ['checkout-server.mjs'], { env: { ...process.env, PORT: '18998', STRIPE_SECRET_KEY: 'rk_mock_not_real', STRIPE_API_BASE: 'http://127.0.0.1:18999' }, stdio: ['ignore', 'pipe', 'inherit'] });
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
  r = await post({ quantity: 0, clips: 200, ref }); assert.equal(r.status, 200); assert.equal(sessions.at(-1).get('line_items[0][quantity]'), '200');
  r = await post({ type: 'raw', length: 120, quantity: 50, clips: 0, ref }); assert.equal(r.status, 200); assert.equal(sessions.at(-1).get('line_items[1][price]'), null);
  for (const bad of [{ type: 'full', length: 30, quantity: 51, ref }, { quantity: 0, clips: 201, ref }, { quantity: 0, clips: 0, ref }, { type: 'full', length: 31, quantity: 1, ref }, { type: 'pet', length: 30, quantity: 1, ref }, { type: 'full', length: 30, quantity: 1.5, ref }, { type: 'full', length: 30, quantity: 1, ref: 'x' }, { type: 'full', length: 30, quantity: -1, clips: 5, ref }, { type: 'full', length: 30, quantity: 1, ref, price: 'price_hack' }]) {
    const n = sessions.length; r = await post(bad);
    if (bad.price) { assert.equal(r.status, 200); assert.equal(sessions.at(-1).get('line_items[0][price]'), 'price_1UaGUZ0A1ZGjwd5gKfZ2X44n'); continue; }
    assert.equal(r.status, 400, JSON.stringify(bad)); assert.equal(sessions.length, n);
  }
  r = await post({ type: 'full', length: 30, quantity: 1, ref }, 'https://evil.example'); assert.equal(r.status, 403); assert.equal(r.cors, null);
  r = await post({ type: 'full', length: 30, quantity: 1, ref }, 'https://www.alexugcpro.com'); assert.equal(r.status, 200);
  console.log('server tests passed');
} finally { child.kill(); mock.close(); }
