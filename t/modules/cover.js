// Trip covers without Firebase Storage: compressed in the browser and stored in Firestore trips/{id}/cover/main.
// To move to Storage later, only compress()/save() need to change.
(function () {
  const MAX_SIDE = 1600, LIMIT = 600 * 1024;
  // trips that already had a photo in the repo before covers moved into Firestore
  const LEGACY = { 'vietnam-2026': '/img/vietnam-2026.jpg', 'taipei-2026': '/img/taipei-2026.jpg' };

  const loadImg = file => new Promise((res, rej) => { const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); }; img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('不是能读取的图片')); }; img.src = url; });
  const bytes = dataUrl => Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4);

  // long side ≤ 1600 px, WebP (JPEG where the browser can't encode WebP), quality from 0.82 down until < 600 KB
  async function compress(file) {
    const img = await loadImg(file), k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
    const webp = c.toDataURL('image/webp', 0.8).startsWith('data:image/webp'), type = webp ? 'image/webp' : 'image/jpeg';
    let q = 0.82, data = c.toDataURL(type, q);
    while (bytes(data) > LIMIT && q > 0.3) { q -= 0.07; data = c.toDataURL(type, q); }
    let scale = 1;   // still too big (very detailed photo): shrink a little more
    while (bytes(data) > LIMIT && scale > 0.5) { scale -= 0.1; const c2 = document.createElement('canvas'); c2.width = Math.round(w * scale); c2.height = Math.round(h * scale);
      c2.getContext('2d').drawImage(c, 0, 0, c2.width, c2.height); data = c2.toDataURL(type, q); }
    return { data, w, h, type, size: bytes(data), quality: Math.round(q * 100) / 100 };
  }
  const save = (fs, tripId, cover) => fs.doc(`trips/${tripId}/cover/main`).set({ ...cover, at: Date.now() });
  async function load(fs, tripId) { try { const s = await fs.doc(`trips/${tripId}/cover/main`).get(); return s.exists ? s.data().data : null; } catch (e) { return null; } }

  // CSS background for a trip card / banner: the cover, the old repo photo, or a colour gradient with the country name
  function css(trip, data) {
    const src = data || LEGACY[trip.id];
    if (src) return `background-image:url('${src.startsWith('data:') ? src : encodeURI(src)}');background-size:cover;background-position:${trip.coverPos || '50% 50%'}`;
    const c = /^#[0-9a-f]{3,8}$/i.test(trip.color || '') ? trip.color : '#0B7A8C';
    return `background:linear-gradient(135deg,${c},color-mix(in srgb,${c} 55%,#0E1419))`;
  }
  const hasPhoto = (trip, data) => !!(data || LEGACY[trip.id]);

  // drag inside el (showing the cover) to choose which part stays visible → "x% y%"
  function draggable(el, pos, onChange) {
    let [x, y] = String(pos || '50% 50%').split(' ').map(v => parseFloat(v) || 50), start = null;
    el.style.backgroundPosition = `${x}% ${y}%`; el.style.touchAction = 'none'; el.style.cursor = 'grab';
    el.onpointerdown = e => { start = { px: e.clientX, py: e.clientY, x, y }; el.setPointerCapture(e.pointerId); };
    el.onpointermove = e => { if (!start) return; const r = el.getBoundingClientRect();
      x = Math.max(0, Math.min(100, start.x - (e.clientX - start.px) / r.width * 100)); y = Math.max(0, Math.min(100, start.y - (e.clientY - start.py) / r.height * 100));
      el.style.backgroundPosition = `${x.toFixed(0)}% ${y.toFixed(0)}%`; };
    el.onpointerup = () => { if (!start) return; start = null; onChange(`${x.toFixed(0)}% ${y.toFixed(0)}%`); };
  }
  window.TripCover = { compress, save, load, css, hasPhoto, draggable, LIMIT };
})();
