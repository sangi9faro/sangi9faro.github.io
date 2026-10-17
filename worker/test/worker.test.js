import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { handle } from '../src/index.js';
import { gcjToWgs } from '../src/gcj.js';

const OWNER = 'owner-uid', PROJECT = 'proj', ORIGIN = 'https://sangi9faro.github.io';
let priv, JWKS;
before(async () => { const k = await generateKeyPair('RS256'); priv = k.privateKey; const pub = { ...(await exportJWK(k.publicKey)), kid: 'k1', alg: 'RS256' }; JWKS = createLocalJWKSet({ keys: [pub] }); });
const token = uid => new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setSubject(uid).setIssuer(`https://securetoken.google.com/${PROJECT}`)
  .setAudience(PROJECT).setIssuedAt().setExpirationTime('1h').sign(priv);

function kv() { const m = new Map(); return { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; }
// upstream fakes: Gemini answers with `geminiReply`, Kakao and 高德 with fixed POIs
function fakeFetch(calls, geminiReply = { places: [] }, geminiStatus = 200) {
  return async (url, init = {}) => {
    calls.push(String(url));
    if (/generativelanguage/.test(url)) {
      calls.body = JSON.parse(init.body);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(geminiReply) }] } }] }), { status: geminiStatus });
    }
    if (/dapi\.kakao/.test(url)) return Response.json({ documents: [{ place_name: '성수 소금빵', road_address_name: '서울 성동구 연무장길 1', x: '127.0557', y: '37.5446' }] });
    if (/restapi\.amap/.test(url)) return Response.json({ status: '1', pois: [{ name: '小龙坎火锅', adname: '锦江区', address: '春熙路 1 号', location: '104.08164,30.65181' }] });
    if (/nominatim/.test(url)) return Response.json([{ name: 'Bánh Mì Huỳnh Hoa', display_name: 'Bánh Mì Huỳnh Hoa, Quận 1', lat: '10.7714', lon: '106.6927' }]);
    if (/xhslink|example\.com/.test(url)) return new Response('<html><head><title>成都必吃 3 家</title><meta property="og:description" content="小龙坎、陈麻婆豆腐"></head></html>');
    return new Response('nope', { status: 404 });
  };
}
const env = (calls, extra = {}) => ({ OWNER_UID: OWNER, FIREBASE_PROJECT: PROJECT, ALLOWED_ORIGIN: ORIGIN, GEMINI_API_KEY: 'g', KAKAO_REST_KEY: 'k', AMAP_KEY: 'a',
  DAILY_LIMIT: '50', USAGE: kv(), JWKS, fetch: fakeFetch(calls, extra.reply, extra.status), ...extra });
function imageReq(tok, { size = 1000, n = 1, origin = ORIGIN } = {}) {
  const fd = new FormData(); for (let i = 0; i < n; i++) fd.append('image', new Blob([new Uint8Array(size)], { type: 'image/jpeg' }), 'a.jpg');
  return new Request('https://w.example/recognize', { method: 'POST', body: fd, headers: { Origin: origin, ...(tok ? { Authorization: 'Bearer ' + tok } : {}) } });
}
const jsonReq = (path, body, tok) => new Request('https://w.example' + path, { method: 'POST', body: JSON.stringify(body), headers: { Origin: ORIGIN, 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok } });

test('no token, another account, or another website → 403', async () => {
  const calls = [];
  assert.equal((await handle(imageReq(null), env(calls))).status, 403);
  assert.equal((await handle(imageReq(await token('someone-else')), env(calls))).status, 403);
  assert.equal((await handle(imageReq(await token(OWNER), { origin: 'https://evil.example' }), env(calls))).status, 403);
  assert.ok(!calls.some(u => /generativelanguage/.test(u)), 'Gemini never called');
});
test('CORS preflight only for the site', async () => {
  const r = await handle(new Request('https://w.example/recognize', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env([]));
  assert.equal(r.status, 204); assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});
test('one image, at most 1.5 MB', async () => {
  const t = await token(OWNER);
  assert.equal((await handle(imageReq(t, { n: 2 }), env([]))).status, 400);
  assert.equal((await handle(imageReq(t, { size: 1.6 * 1024 * 1024 }), env([]))).status, 413);
});
test('screenshot → places with coordinates: Kakao for KR, 高德 converted to WGS-84 for CN', async () => {
  const calls = [], reply = { places: [
    { name: '성수 소금빵', nameZh: '圣水盐面包', city: '首尔', district: '성동구', country: 'KR', category: 'cafe', source: 'naver', confidence: 0.92 },
    { name: '小龙坎火锅', nameZh: '小龙坎火锅', city: '成都', district: '锦江区', country: 'CN', category: 'food', cuisine: '火锅', source: 'dianping', confidence: 0.88 }] };
  const r = await handle(imageReq(await token(OWNER)), env(calls, { reply }));
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.places.length, 2); assert.equal(j.left, 49);
  assert.equal(j.places[0].candidates[0].provider, 'kakao');
  assert.deepEqual([j.places[0].candidates[0].lat, j.places[0].candidates[0].lng], [37.5446, 127.0557], 'Kakao (KR) coordinates are not shifted');
  const [wLat, wLng] = gcjToWgs(30.65181, 104.08164), c = j.places[1].candidates[0];
  assert.ok(Math.abs(c.lat - wLat) < 1e-5 && Math.abs(c.lng - wLng) < 1e-5 && Math.abs(c.lng - 104.08164) > 0.001, 'CN result converted from GCJ-02');
  assert.ok(calls.some(u => /dapi\.kakao.*%EC%84%B1%EB%8F%99%EA%B5%AC/.test(u)), 'Kakao query includes the district');
  assert.ok(calls.some(u => /restapi\.amap.*city=%E6%88%90%E9%83%BD/.test(u)), '高德 query is limited to the city');
  assert.ok(calls.body.contents[0].parts.some(p => p.inline_data && p.inline_data.mime_type === 'image/jpeg'), 'image sent to Gemini');
});
test('not a place → empty list; made-up fields are cleaned', async () => {
  const r = await handle(imageReq(await token(OWNER)), env([], { reply: { places: [{ name: '', nameZh: '' }, { name: 'X', category: 'weird', confidence: 7, country: 'kor' }] } }));
  const j = await r.json(); assert.equal(j.places.length, 1); assert.equal(j.places[0].category, 'other'); assert.equal(j.places[0].confidence, 1); assert.equal(j.places[0].country, 'KO');
});
test('Gemini 429 → quota error, no retry', async () => {
  const calls = [], r = await handle(imageReq(await token(OWNER)), env(calls, { status: 429 }));
  assert.equal(r.status, 429); assert.equal((await r.json()).why, 'gemini');
  assert.equal(calls.filter(u => /generativelanguage/.test(u)).length, 1);
});
test('daily limit (Korea date) stops at DAILY_LIMIT', async () => {
  const e = env([], { DAILY_LIMIT: '2' }), t = await token(OWNER);
  assert.equal((await handle(imageReq(t), e)).status, 200);
  assert.equal((await handle(imageReq(t), e)).status, 200);
  const r = await handle(imageReq(t), e); assert.equal(r.status, 429); assert.equal((await r.json()).why, 'daily');
});
test('粘贴店名 /search: no AI, up to 5 results, still works when the AI quota is gone', async () => {
  const calls = [], e = env(calls, { DAILY_LIMIT: '0' });
  const r = await handle(jsonReq('/search', { q: '성수 소금빵', city: '首尔', country: 'KR' }, await token(OWNER)), e);
  assert.equal(r.status, 200); assert.equal((await r.json()).results[0].provider, 'kakao');
  assert.ok(calls.some(u => /size=5/.test(u))); assert.ok(!calls.some(u => /generativelanguage/.test(u)));
});
test('粘贴链接 /recognize-text reads the page title and description', async () => {
  const calls = [], reply = { places: [{ name: '小龙坎火锅', city: '成都', country: 'CN', category: 'food', confidence: 0.8 }] };
  const r = await handle(jsonReq('/recognize-text', { text: '快来看 https://xhslink.com/abc 成都必吃' }, await token(OWNER)), env(calls, { reply }));
  assert.equal(r.status, 200);
  const sent = calls.body.contents[0].parts.map(p => p.text || '').join('\n');
  assert.ok(/成都必吃 3 家/.test(sent) && /小龙坎、陈麻婆豆腐/.test(sent), 'page title + description passed to the model');
});
test('other countries use Nominatim with a contact User-Agent', async () => {
  const calls = [], reply = { places: [{ name: 'Bánh Mì Huỳnh Hoa', city: '胡志明', country: 'VN', category: 'food', confidence: 0.9 }] };
  const r = await handle(imageReq(await token(OWNER)), env(calls, { reply, CONTACT_EMAIL: 'me@example.com' }));
  const j = await r.json(); assert.equal(j.places[0].candidates[0].provider, 'osm'); assert.ok(calls.some(u => /nominatim.*countrycodes=vn/.test(u)));
});
