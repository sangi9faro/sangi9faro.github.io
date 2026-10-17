// 新建旅行 (owner, homepage): five short steps in one sheet, then writes trips/{id}, info/static and the cover.
// Needs editor.js (sheet), cover.js, countries.js, presets.js, Leaflet (for picking cities on the map).
// The new trip starts with the same sections as the Vietnam trip (presets.js), filled for its country.
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = r => { try { lucide.createIcons({ attrs: { 'stroke-width': 1.75 }, root: r }); } catch (e) {} };
  const STEPS = ['名称和日期', '国家和城市', '成员', '清单和功能', '封面'];
  // Nominatim: at most one request per second (usage policy)
  let lastGeo = 0;
  async function geo(url) { const wait = Math.max(0, lastGeo + 1100 - Date.now()); if (wait) await new Promise(r => setTimeout(r, wait)); lastGeo = Date.now();
    const r = await fetch(url, { headers: { 'Accept-Language': 'zh-CN,zh' } }); if (!r.ok) throw new Error('地点搜索暂时不可用'); return r.json(); }
  const search = q => geo(`https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&q=${encodeURIComponent(q)}`);
  const reverse = (lat, lng) => geo(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${lat}&lon=${lng}`);
  const placeName = r => { const a = r.address || {}; return a.city || a.town || a.village || a.county || a.state || (r.display_name || '').split(',')[0]; };
  // 1 CNY = x of each currency (open.er-api.com, free, no key)
  async function fetchRates(curs) { const want = curs.filter(c => c !== 'CNY'); if (!want.length) return {};
    try { const c = new AbortController(); setTimeout(() => c.abort(), 4000); const j = await (await fetch('https://open.er-api.com/v6/latest/CNY', { signal: c.signal })).json();
      return Object.fromEntries(want.filter(k => j.rates && j.rates[k]).map(k => [k, j.rates[k]])); } catch (e) { return {}; } }

  function open({ fs, uid, onCreated }) {
    const st = { step: 0, title: '', start: '', end: '', country: 'TW', places: [], n: 2, names: ['', '', '', '', '', '', '', ''], tpl: { base: true }, mods: { guide: true, tools: true, bills: true, packing: true, vote: true },
      color: TripEditor.COLORS[1], visibility: 'members', id: '', cover: null, coverPos: '50% 50%' };
    // built-in templates (presets.js); a v2+ copy in Firestore (templates/{id}) wins, so they can be tuned without a deploy
    const templates = { ...TripPresets.TEMPLATES }; let map = null, results = [];
    fs.collection('templates').get().then(s => { s.docs.forEach(d => { if ((d.data().v || 1) >= 2) templates[d.id] = d.data(); }); }).catch(() => {});
    const s = TripEditor.sheet('新建旅行', '<form class="tform nt" novalidate></form>', { wide: true });
    const f = s.body.querySelector('form');
    const year = () => (st.start || '').slice(0, 4) || String(new Date().getFullYear());
    const suggestId = () => `${(TripCountries.byCode(st.country) || {}).slug || 'trip'}-${year()}`;

    function draw() {
      const C = TripCountries;
      const head = `<ol class="nt-steps">${STEPS.map((n, i) => `<li class="${i === st.step ? 'on' : i < st.step ? 'done' : ''}"><span>${i + 1}</span>${n}</li>`).join('')}</ol>`;
      let body = '';
      if (st.step === 0) body = `<label class="tf">旅行名称<input name="title" maxlength="60" value="${esc(st.title)}" placeholder="例如：台北圣诞行" required></label>
        <div class="tf-row"><label class="tf">出发<input type="date" name="start" value="${esc(st.start)}"></label><label class="tf">回来<input type="date" name="end" value="${esc(st.end)}"></label></div>`;
      if (st.step === 1) body = `<label class="tf">国家 / 地区<select name="country">${C.map(c => `<option value="${c.code}" ${c.code === st.country ? 'selected' : ''}>${c.name}</option>`).join('')}</select></label>
        <div class="tf">城市（按顺序添加；可以搜索，也可以在地图上点）
          <div class="row nt-search"><input name="q" placeholder="输入城市名，例如：台北" autocomplete="off"><button type="button" class="btn btn-sm" data-search><i data-lucide="search" class="i18"></i>搜索</button></div>
          <div class="nt-results">${results.map((r, i) => `<button type="button" class="nt-res" data-pick="${i}"><b>${esc(placeName(r))}</b><span>${esc(r.display_name)}</span></button>`).join('')}</div>
          <div class="nt-map" id="ntMap"></div>
          <div class="nt-places">${st.places.map((p, i) => `<span class="chip on">${i + 1}. ${esc(p.name)}<button type="button" data-unplace="${i}" aria-label="移除 ${esc(p.name)}">×</button></span>`).join('') || '<span class="sub">还没有添加城市</span>'}</div></div>`;
      if (st.step === 2) body = `<div class="tf">几个人<div class="row"><button type="button" class="btn btn-sm" data-n="-1" aria-label="少一人">−</button><b class="num nt-n">${st.n}</b><button type="button" class="btn btn-sm" data-n="1" aria-label="多一人">＋</button></div></div>
        ${Array.from({ length: st.n }, (_, i) => `<label class="tf">成员 ${'ABCDEFGH'[i]}${i === 0 ? '（一般是你自己）' : ''}<input data-name="${i}" maxlength="20" value="${esc(st.names[i])}" placeholder="成员${'ABCDEFGH'[i]}"></label>`).join('')}
        <p class="sub">名字只存在这次旅行的数据里，之后可以改。</p>`;
      if (st.step === 3) body = `<div class="tf">清单模板（可以多选，合并后复制到这次旅行，以后单独增删）
          <div class="tg-list">${Object.entries(TripPresets.NAMES).map(([k, n]) => `<label class="tg"><input type="checkbox" data-tpl="${k}" ${st.tpl[k] ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div></div>
        <div class="tf">启用的功能<div class="tg-list">${TripEditor.MODULES.map(([k, n]) => `<label class="tg"><input type="checkbox" data-mod="${k}" ${st.mods[k] ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div></div>`;
      if (st.step === 4) body = `<div class="tf">封面（可以跳过，以后再换）<div class="cov" id="ntCover" style="${TripCover.css({ id: '', color: st.color, coverPos: st.coverPos }, st.cover && st.cover.data)}"><span class="cov-hint">${st.cover ? '拖动调整显示位置' : (TripCountries.byCode(st.country) || {}).name || ''}</span></div>
          <div class="row"><label class="btn btn-sm"><i data-lucide="image-up" class="i18"></i>从相册选</label><input type="file" accept="image/*" hidden id="ntFile"><span class="sub" id="ntCoverInfo">${st.cover ? `${Math.round(st.cover.size / 1024)} KB` : ''}</span></div></div>
        <div class="tf">主题颜色<div class="sw-row">${TripEditor.COLORS.map(c => `<button type="button" class="sw${c === st.color ? ' on' : ''}" data-color="${c}" style="--c:${c}" aria-label="颜色 ${c}"></button>`).join('')}</div></div>
        <div class="tf">公开范围<div class="seg vis"><label><input type="radio" name="visibility" value="members" ${st.visibility === 'members' ? 'checked' : ''}><span>只有成员能看</span></label><label><input type="radio" name="visibility" value="link" ${st.visibility === 'link' ? 'checked' : ''}><span>有链接就能看</span></label></div></div>
        <label class="tf">旅行 id（出现在链接里，只能用小写字母、数字和 -）<input name="id" value="${esc(st.id || suggestId())}" pattern="[a-z0-9-]{3,40}"></label>`;
      f.innerHTML = head + body + `<p class="sub tf-err" role="alert"></p><div class="tsheet-act">
        ${st.step ? '<button type="button" class="btn ghost" data-back><i data-lucide="chevron-left" class="i18"></i>上一步</button>' : '<span></span>'}
        ${st.step < STEPS.length - 1 ? '<button type="submit" class="btn btn-primary">下一步<i data-lucide="chevron-right" class="i18"></i></button>' : '<button type="submit" class="btn btn-primary"><i data-lucide="sparkles" class="i18"></i>创建旅行</button>'}</div>`;
      icons(f);
      if (st.step === 1) drawMap();
      if (st.step === 4) {
        if (st.cover) TripCover.draggable(f.querySelector('#ntCover'), st.coverPos, p => { st.coverPos = p; });
        f.querySelector('label.btn').onclick = () => f.querySelector('#ntFile').click();
        f.querySelector('#ntFile').onchange = async e => { const file = e.target.files[0]; if (!file) return; f.querySelector('#ntCoverInfo').textContent = '压缩中…';
          try { st.cover = await TripCover.compress(file); st.coverPos = '50% 50%'; draw(); } catch (er) { f.querySelector('#ntCoverInfo').textContent = er.message; } };
      }
    }
    function drawMap() {
      const el = f.querySelector('#ntMap'); if (!window.L || !el) return;
      map = L.map(el, { zoomControl: false, attributionControl: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, className: 'tiles' }).addTo(map);
      const pts = st.places.map(p => [p.lat, p.lng]);
      pts.forEach((p, i) => L.circleMarker(p, { radius: 7, color: '#fff', weight: 2, fillColor: st.color, fillOpacity: 1 }).addTo(map).bindTooltip(st.places[i].name));
      if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 10 }); else map.setView([24, 115], 3);
      map.on('click', async e => {
        const err = f.querySelector('.tf-err'); err.textContent = '正在查这个位置…';
        try { const r = await reverse(e.latlng.lat, e.latlng.lng); st.places.push({ name: placeName(r) || '地点', lat: +e.latlng.lat.toFixed(4), lng: +e.latlng.lng.toFixed(4) }); err.textContent = ''; draw(); }
        catch (er) { err.textContent = er.message; }
      });
    }
    function readStep() {
      const v = n => f.elements[n] ? String(f.elements[n].value || '').trim() : '';
      if (st.step === 0) { st.title = v('title'); st.start = v('start'); st.end = v('end'); }
      if (st.step === 1) st.country = v('country') || st.country;
      if (st.step === 2) f.querySelectorAll('[data-name]').forEach(i => { st.names[+i.dataset.name] = i.value.trim(); });
      if (st.step === 3) { f.querySelectorAll('[data-tpl]').forEach(i => { st.tpl[i.dataset.tpl] = i.checked; }); f.querySelectorAll('[data-mod]').forEach(i => { st.mods[i.dataset.mod] = i.checked; }); }
      if (st.step === 4) { st.visibility = f.elements.visibility.value; st.id = v('id'); }
    }
    function check() {
      if (st.step === 0) { if (!st.title) return '先填旅行名称'; if (!/^\d{4}-\d{2}-\d{2}$/.test(st.start) || !/^\d{4}-\d{2}-\d{2}$/.test(st.end)) return '选一下出发和回来的日期'; if (st.end < st.start) return '回来不能早于出发'; }
      if (st.step === 1 && !st.places.length) return '至少添加一个城市';
      if (st.step === 4 && !/^[a-z0-9-]{3,40}$/.test(st.id)) return 'id 只能用小写字母、数字和 -（3–40 个字符）';
      return '';
    }
    f.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.back !== undefined) { readStep(); st.step--; draw(); }
      else if (b.dataset.search !== undefined) { const q = String(f.elements.q.value || '').trim(); if (!q) return; const err = f.querySelector('.tf-err'); err.textContent = '搜索中…';
        try { results = await search(`${q} ${(TripCountries.byCode(f.elements.country.value) || {}).name || ''}`); err.textContent = results.length ? '' : '没找到，换个写法试试'; st.country = f.elements.country.value; draw(); } catch (er) { err.textContent = er.message; } }
      else if (b.dataset.pick !== undefined) { const r = results[+b.dataset.pick]; st.places.push({ name: placeName(r), lat: +(+r.lat).toFixed(4), lng: +(+r.lon).toFixed(4) }); results = []; st.country = f.elements.country.value; draw(); }
      else if (b.dataset.unplace !== undefined) { st.places.splice(+b.dataset.unplace, 1); draw(); }
      else if (b.dataset.n) { readStep(); st.n = Math.max(1, Math.min(8, st.n + +b.dataset.n)); draw(); }
      else if (b.dataset.color) { st.color = b.dataset.color; readStep(); draw(); }
    });
    f.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.name === 'q') { e.preventDefault(); f.querySelector('[data-search]').click(); } });
    f.addEventListener('submit', async e => {
      e.preventDefault(); readStep(); const msg = check(); const err = f.querySelector('.tf-err');
      if (msg) { err.textContent = msg; return; }
      if (st.step < STEPS.length - 1) { st.step++; draw(); return; }
      const btn = f.querySelector('[type=submit]'); btn.disabled = true; err.textContent = '正在创建…';
      try { await create(); } catch (er) { err.textContent = '创建失败：' + (er.code || er.message); btn.disabled = false; }
    });
    async function create() {
      const ref = fs.doc('trips/' + st.id);
      if ((await ref.get()).exists) throw new Error(`id「${st.id}」已经用过了，换一个`);
      const C = TripCountries.byCode(st.country) || { name: st.country, cur: 'CNY', sos: [] };
      const members = Object.fromEntries(Array.from({ length: st.n }, (_, i) => ['m' + (i + 1), st.names[i] || '成员' + 'ABCDEFGH'[i]]));
      const currencies = [...new Set([C.cur, 'CNY', 'KRW'])], rates = await fetchRates(currencies);   // like Vietnam: local, 人民币, 韩元
      const trip = { title: st.title, start: st.start, end: st.end, country: C.name, countryCode: st.country, route: st.places.map(p => p.name), places: st.places,
        color: st.color, summary: '', coverPos: st.coverPos, members, modules: st.mods, currencies, baseCurrency: 'CNY',
        rates, ratesAt: Object.keys(rates).length ? Date.now() : 0, joinCode: TripInvite.newCode(), visibility: st.visibility, owner: uid, at: Date.now(), updatedAt: Date.now() };
      const chosen = Object.keys(st.tpl).filter(k => st.tpl[k] && templates[k]).map(k => templates[k]);
      await ref.set(trip);
      await fs.doc(`trips/${st.id}/info/static`).set({ ...TripPresets.info(st.country, chosen), at: Date.now() });
      if (st.cover) await TripCover.save(fs, st.id, st.cover);
      s.close(); onCreated && onCreated(st.id, trip);
    }
    draw();
  }
  window.TripNew = { open };
})();
