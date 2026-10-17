// 高德 (and other mainland-China maps) return GCJ-02 coordinates, shifted a few hundred metres from the
// WGS-84 that Leaflet/OSM use. wgsToGcj is the public forward formula; gcjToWgs inverts it by iteration
// (error well under 1 m). outOfChina is only a rough box (it also covers Seoul and Taipei), so these are
// applied to 高德 results only (geo.js), never to Kakao or OpenStreetMap coordinates.
const A = 6378245.0, EE = 0.00669342162296594323;

export const outOfChina = (lat, lng) => lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;

function tLat(x, y) {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  r += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
  r += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
  return r;
}
function tLng(x, y) {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  r += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
  r += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
  return r;
}

export function wgsToGcj(lat, lng) {
  if (outOfChina(lat, lng)) return [lat, lng];
  let dLat = tLat(lng - 105, lat - 35), dLng = tLng(lng - 105, lat - 35);
  const rad = lat / 180 * Math.PI, s = Math.sin(rad), magic = 1 - EE * s * s, sq = Math.sqrt(magic);
  dLat = dLat * 180 / ((A * (1 - EE)) / (magic * sq) * Math.PI);
  dLng = dLng * 180 / (A / sq * Math.cos(rad) * Math.PI);
  return [lat + dLat, lng + dLng];
}

export function gcjToWgs(lat, lng) {
  if (outOfChina(lat, lng)) return [lat, lng];
  let wLat = lat, wLng = lng;
  for (let i = 0; i < 10; i++) {   // converges in 3–4 steps
    const [gLat, gLng] = wgsToGcj(wLat, wLng);
    const eLat = gLat - lat, eLng = gLng - lng;
    wLat -= eLat; wLng -= eLng;
    if (Math.abs(eLat) < 1e-9 && Math.abs(eLng) < 1e-9) break;
  }
  return [wLat, wLng];
}

// metres between two WGS-84 points (haversine)
export function metres(a, b) {
  const R = 6371008.8, r = x => x * Math.PI / 180, dLat = r(b[0] - a[0]), dLng = r(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
