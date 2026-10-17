// Leg classification, road routes (OSRM) and flight arcs for guide.html.
// Also loaded by scripts/build-routes.mjs (CommonJS export at the bottom), so keep it DOM-free.
(function (root) {
  const AIRPORTS = [{ code: 'SGN', lat: 10.818, lng: 106.6563 }, { code: 'CXR', lat: 11.9983, lng: 109.2174 }, { code: 'TPE', lat: 25.0797, lng: 121.2342 },
    { code: 'TSA', lat: 25.0694, lng: 121.5525 }, { code: 'ICN', lat: 37.4602, lng: 126.4407 }, { code: 'GMP', lat: 37.5583, lng: 126.7906 }, { code: 'HAN', lat: 21.2187, lng: 105.8042 },
    { code: 'DAD', lat: 16.0439, lng: 108.1994 }, { code: 'PQC', lat: 10.1698, lng: 103.9931 }, { code: 'NRT', lat: 35.772, lng: 140.3929 }, { code: 'HND', lat: 35.5494, lng: 139.7798 }, { code: 'BKK', lat: 13.69, lng: 100.7501 }];
  // cities = the trip's places (set by the guide from trip.places); labels alternate below / above the dot
  let CITIES = [];
  function setCities(places) { CITIES = (places || []).filter(p => isFinite(p.lat) && isFinite(p.lng)).map((p, i) => ({ id: 'c' + i, name: p.name, lat: +p.lat, lng: +p.lng, r: 40, dir: i % 2 ? 'top' : 'bottom' })); }
  const VIA = ['walk', 'taxi', 'bus', 'flight', 'none'];
  const VIA_NAME = { walk: '步行', taxi: '打车', bus: '大巴', flight: '飞机', none: '不连线' };

  function km(a, b) {
    const R = 6371, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const airportOf = l => AIRPORTS.find(a => km(a, l) < 3) || (/机场|airport/i.test(l.name || '') ? { code: null } : null);
  // the nearest place within its radius (cities can be close: Nha Trang and Cam Ranh are 21 km apart)
  const cityOf = l => CITIES.map(c => [c, km(c, l)]).filter(([c, d]) => d <= c.r).sort((a, b) => a[1] - b[1]).map(([c]) => c)[0] || null;
  const busName = l => /大巴|客运站/.test(l.name || '');

  // how we get from a to b: explicit b.via, else the auto rules
  function classify(a, b) {
    if (VIA.includes(b.via)) return b.via;
    const d = km(a, b);
    if (d < 0.1) return 'none';
    if (airportOf(a) && airportOf(b) && d > 100) return 'flight';
    // a long leg that starts or ends at a bus stop, or a long ground "transport" stop, is the bus;
    // the short ride *to* the bus station stays a taxi
    if (d > 100 && (busName(a) || busName(b) || b.type === 'transport')) return 'bus';
    if (d < 1.2) return 'walk';
    return 'taxi';
  }

  const key = (a, b) => `${(+a.lat).toFixed(4)},${(+a.lng).toFixed(4)}|${(+b.lat).toFixed(4)},${(+b.lng).toFixed(4)}`;

  // Douglas–Peucker on [lat,lng] pairs, loosening the tolerance until at most `max` points remain
  function simplify(pts, max = 300) {
    if (pts.length <= max) return pts;
    const dp = (tol) => {
      const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
      const stack = [[0, pts.length - 1]];
      while (stack.length) {
        const [s, e] = stack.pop(); let idx = -1, best = tol;
        const [y1, x1] = pts[s], [y2, x2] = pts[e], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1e-12;
        for (let i = s + 1; i < e; i++) { const d = Math.abs(dy * (pts[i][1] - x1) - dx * (pts[i][0] - y1)) / L; if (d > best) { best = d; idx = i; } }
        if (idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
      }
      return pts.filter((_, i) => keep[i]);
    };
    let tol = 1e-5, out = dp(tol);
    while (out.length > max) { tol *= 1.6; out = dp(tol); }
    return out;
  }

  // OSRM public demo server: free, rate-limited, no uptime guarantee
  const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
  async function fetchRoute(a, b, { timeout = 5000, fetchFn } = {}) {
    const f = fetchFn || root.fetch.bind(root), ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), timeout) : 0;
    try {
      const r = await f(`${OSRM}${a.lng},${a.lat};${b.lng},${b.lat}?overview=simplified&geometries=geojson`, ctl ? { signal: ctl.signal } : {});
      if (!r.ok) throw new Error('osrm ' + r.status);
      const j = await r.json();
      if (j.code !== 'Ok' || !j.routes || !j.routes[0]) throw new Error('osrm ' + j.code);
      const rt = j.routes[0];
      return { coords: simplify(rt.geometry.coordinates.map(([lng, lat]) => [+lat.toFixed(5), +lng.toFixed(5)])),
        km: Math.round(rt.distance / 100) / 10, min: Math.round(rt.duration / 60) };
    } finally { clearTimeout(t); }
  }

  // quadratic Bézier from a to b, bulging northwards by 20% of the distance; 40 segments
  function arc(a, b, n = 40) {
    const k = Math.cos((a.lat + b.lat) / 2 * Math.PI / 180);   // work in roughly-isotropic units
    const ax = a.lng * k, ay = a.lat, bx = b.lng * k, by = b.lat;
    const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    let px = -dy / L, py = dx / L; if (py < 0) { px = -px; py = -py; }   // the perpendicular that points north
    const cx = mx + px * L * 0.2, cy = my + py * L * 0.2, out = [];
    for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t;
      out.push([u * u * ay + 2 * u * t * cy + t * t * by, (u * u * ax + 2 * u * t * cx + t * t * bx) / k]); }
    return out;
  }
  const flightMin = d => Math.round((d / 750 * 60 + 45) / 5) * 5;   // cruise + taxi/climb overhead
  const busMin = carMin => Math.round(carMin * 1.3);                 // buses are slower and stop on the way
  function dur(min) { const h = Math.floor(min / 60), m = min % 60; return h ? `${h} 小时${m ? ` ${m} 分` : ''}` : `${m} 分钟`; }
  const hourRange = min => { const lo = Math.max(1, Math.floor(min / 60)), hi = Math.ceil(min * 1.25 / 60); return lo === hi ? `${lo} 小时` : `${lo}–${hi} 小时`; };

  const api = { AIRPORTS, get CITIES() { return CITIES; }, setCities, VIA, VIA_NAME, km, airportOf, cityOf, classify, key, simplify, fetchRoute, arc, flightMin, busMin, dur, hourRange };
  root.TripRoutes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
