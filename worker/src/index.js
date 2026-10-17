// faro-favorites Worker: POST /recognize (one screenshot), /recognize-text (shared links / text), /search (name → coordinates).
// Only https://sangi9faro.github.io may call it, and only with the owner's Firebase ID token.
import { ownerFromRequest } from './auth.js';
import { askGemini, readLinks, QuotaError } from './ai.js';
import { geocodePlace, searchByName } from './geo.js';

const MAX_IMAGE = 1.5 * 1024 * 1024;

function cors(env, origin) {
  const ok = origin === env.ALLOWED_ORIGIN || (env.DEV_EMULATOR === '1' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || ''));
  return ok ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : null;
}
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });

// daily counter in KV (Korea date); the AI routes count, /search does not
async function takeQuota(env) {
  const limit = +env.DAILY_LIMIT || 50;
  if (!env.USAGE) return { ok: true, left: limit };
  const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), key = 'n:' + day;
  const n = +(await env.USAGE.get(key)) || 0;
  if (n >= limit) return { ok: false, left: 0 };
  await env.USAGE.put(key, String(n + 1), { expirationTtl: 3 * 86400 });
  return { ok: true, left: limit - n - 1 };
}

async function withCandidates(env, places) {
  const out = [];
  for (const p of places) out.push({ ...p, candidates: await geocodePlace(env, p) });   // sequential: Nominatim allows 1 req/s
  return out;
}

const b64 = buf => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };

export async function handle(request, env) {
  env = { fetch: (...a) => fetch(...a), ...env };
  const origin = request.headers.get('Origin'), h = cors(env, origin);
  if (!h) return json({ error: 'origin' }, 403, {});
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (request.method !== 'POST') return json({ error: 'method' }, 405, h);
  const who = await ownerFromRequest(request, env);
  if (!who.ok) return json({ error: 'forbidden' }, 403, h);
  const path = new URL(request.url).pathname;
  try {
    if (path === '/search') {
      const { q = '', city = '', country = '' } = await request.json();
      if (!String(q).trim()) return json({ error: 'empty' }, 400, h);
      return json({ results: await searchByName(env, String(q).slice(0, 80), String(city).slice(0, 30), String(country).slice(0, 2)) }, 200, h);
    }
    if (path === '/recognize' || path === '/recognize-text') {
      let parts;
      if (path === '/recognize') {
        const form = await request.formData(), files = form.getAll('image');
        if (files.length !== 1) return json({ error: 'one image per request' }, 400, h);
        const f = files[0];
        if (!f || typeof f.arrayBuffer !== 'function' || !/^image\//.test(f.type || '')) return json({ error: 'not an image' }, 400, h);
        if (f.size > MAX_IMAGE) return json({ error: 'too big' }, 413, h);
        parts = [{ inline_data: { mime_type: f.type, data: b64(await f.arrayBuffer()) } }];
      } else {
        const { text = '' } = await request.json(), t = String(text).slice(0, 2000);
        if (!t.trim()) return json({ error: 'empty' }, 400, h);
        parts = [{ text: `分享的文字：\n${t}\n\n${await readLinks(env, t)}` }];
      }
      const q = await takeQuota(env);
      if (!q.ok) return json({ error: 'quota', why: 'daily' }, 429, h);
      const places = await askGemini(env, parts);
      return json({ places: await withCandidates(env, places), left: q.left }, 200, h);
    }
    return json({ error: 'not found' }, 404, h);
  } catch (e) {
    if (e instanceof QuotaError) return json({ error: 'quota', why: 'gemini' }, 429, h);
    return json({ error: 'failed', detail: String(e.message || e).slice(0, 120) }, 502, h);
  }
}

export default { fetch: (request, env) => handle(request, env) };
