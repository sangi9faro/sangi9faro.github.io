// Coordinates for a place name, by country: Kakao (KR), 高德 (CN, converted from GCJ-02), Nominatim (everything else).
// Every result is WGS-84: { name, address, lat, lng, provider }.
import { gcjToWgs } from './gcj.js';

const timeout = ms => AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;
const round = n => Math.round(n * 1e6) / 1e6;

export async function kakao(env, q, size = 3) {
  if (!env.KAKAO_REST_KEY) return [];
  const u = `https://dapi.kakao.com/v2/local/search/keyword.json?size=${size}&query=${encodeURIComponent(q)}`;
  const r = await env.fetch(u, { headers: { Authorization: `KakaoAK ${env.KAKAO_REST_KEY}` }, signal: timeout(6000) });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.documents || []).map(d => ({ name: d.place_name, address: d.road_address_name || d.address_name || '', lat: round(+d.y), lng: round(+d.x), provider: 'kakao' }));
}

export async function amap(env, q, city, size = 3) {
  if (!env.AMAP_KEY) return [];
  const u = `https://restapi.amap.com/v3/place/text?offset=${size}&page=1&citylimit=${city ? 'true' : 'false'}&keywords=${encodeURIComponent(q)}`
    + (city ? `&city=${encodeURIComponent(city)}` : '') + `&key=${env.AMAP_KEY}`;
  const r = await env.fetch(u, { signal: timeout(6000) });
  if (!r.ok) return [];
  const j = await r.json();
  if (j.status !== '1') return [];
  return (j.pois || []).filter(p => typeof p.location === 'string' && p.location.includes(',')).slice(0, size).map(p => {
    const [lng, lat] = p.location.split(',').map(Number), [wLat, wLng] = gcjToWgs(lat, lng);
    return { name: p.name, address: [p.adname, typeof p.address === 'string' ? p.address : ''].filter(Boolean).join(' '), lat: round(wLat), lng: round(wLng), provider: 'amap' };
  });
}

// Nominatim allows 1 request per second: calls are queued through `nominatimGate`
let lastNominatim = 0;
async function nominatimGate() { const wait = Math.max(0, lastNominatim + 1100 - Date.now()); if (wait) await new Promise(r => setTimeout(r, wait)); lastNominatim = Date.now(); }
export async function nominatim(env, q, size = 3, countryCode = '') {
  await nominatimGate();
  const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${size}&accept-language=zh-CN,zh,en`
    + (countryCode ? `&countrycodes=${countryCode.toLowerCase()}` : '') + `&q=${encodeURIComponent(q)}`;
  const r = await env.fetch(u, { headers: { 'User-Agent': `faro-trip-favorites/1.0 (${env.CONTACT_EMAIL || 'no-contact'})` }, signal: timeout(8000) });
  if (!r.ok) return [];
  const j = await r.json();
  return (Array.isArray(j) ? j : []).map(d => ({ name: d.name || String(d.display_name || '').split(',')[0], address: d.display_name || '', lat: round(+d.lat), lng: round(+d.lon), provider: 'osm' }));
}

// candidates for one recognised place (max 3)
export async function geocodePlace(env, p) {
  const cc = String(p.country || '').toUpperCase(), name = p.name || p.nameZh || '';
  if (!name) return [];
  try {
    if (cc === 'KR') { const r = await kakao(env, [name, p.district].filter(Boolean).join(' ')); return r.length ? r : kakao(env, name); }
    if (cc === 'CN') { const r = await amap(env, name, p.city); return r.length ? r : amap(env, [p.city, name].filter(Boolean).join(' '), ''); }
    return nominatim(env, [name, p.city].filter(Boolean).join(' '), 3, cc.length === 2 ? cc : '');
  } catch (e) { return []; }
}

// 粘贴店名: search without the AI (up to 5 results)
export async function searchByName(env, q, city, cc) {
  cc = String(cc || '').toUpperCase();
  try {
    if (cc === 'KR') return kakao(env, [q, city].filter(Boolean).join(' '), 5);
    if (cc === 'CN') return amap(env, q, city, 5);
    return nominatim(env, [q, city].filter(Boolean).join(' '), 5, cc.length === 2 ? cc : '');
  } catch (e) { return []; }
}
