// 收藏 → ＋: 从截图添加 / 粘贴店名 / 粘贴链接 / 手动添加. Screenshots and links go to the Worker (worker/), which
// reads them with Gemini and finds coordinates; every place becomes a card where I only confirm the spot and tap stars.
// Needs favorites.html's globals passed in through FavAdd.init(ctx). Screenshots themselves are never stored.
(function () {
  const EMU = !/github\.io$/.test(location.hostname) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  // set after `npx wrangler deploy` (worker/README.md); empty = the AI options explain how to switch them on
  const WORKER = EMU ? 'http://127.0.0.1:8787' : '';
  const MAX_FILES = 20, PARALLEL = 2, LONG_SIDE = 1600, MAX_BYTES = 1.45 * 1024 * 1024;
  const COUNTRY = { KR: '韩国', CN: '中国', JP: '日本', TW: '台湾', HK: '香港', VN: '越南', TH: '泰国', SG: '新加坡', MY: '马来西亚', US: '美国' };
  const CITY_CC = { 首尔: 'KR', 釜山: 'KR', 济州: 'KR', 成都: 'CN', 重庆: 'CN', 上海: 'CN', 北京: 'CN', 台北: 'TW', 东京: 'JP', 大阪: 'JP', 胡志明: 'VN', 芽庄: 'VN' };
  let C;   // context from favorites.html

  const $ = (s, r = document) => r.querySelector(s);
  const norm = s => String(s || '').toLowerCase().replace(/[\s·・\-_()（）]/g, '');
  const metres = (a, b) => { const R = 6371008.8, r = x => x * Math.PI / 180, dLat = r(b[0] - a[0]), dLng = r(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

  /* ---------- talking to the Worker ---------- */
  async function call(path, body) {
    if (!WORKER) throw Object.assign(new Error('识别服务还没部署'), { code: 'nows' });
    const u = C.user(); if (!u) throw Object.assign(new Error('请先登录'), { code: 'auth' });
    const headers = { Authorization: 'Bearer ' + await u.getIdToken() };
    if (!(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    let r;
    try { r = await fetch(WORKER + path, { method: 'POST', headers, body: body instanceof FormData ? body : JSON.stringify(body) }); }
    catch (e) { throw Object.assign(new Error('连不上识别服务，检查一下网络'), { code: 'net' }); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 429) throw Object.assign(new Error('今天的免费识别次数用完了，可以用「粘贴店名」添加'), { code: 'quota' });
    if (r.status === 403) throw Object.assign(new Error('只有主人账号能用识别'), { code: 'auth' });
    if (!r.ok) throw Object.assign(new Error(r.status >= 500 ? '识别服务出错了，可以重试' : '识别失败（' + (j.error || r.status) + '）'), { code: 'fail' });
    return j;
  }

  // long side ≤ 1600 px, JPEG 0.8 (small text must stay readable); lower the quality only if still over the Worker's limit
  async function compress(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('不是能读取的图片')); i.src = url; });
      const k = Math.min(1, LONG_SIDE / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      for (const q of [0.8, 0.7, 0.6, 0.5]) { const b = await new Promise(r => c.toBlob(r, 'image/jpeg', q)); if (b && b.size <= MAX_BYTES) return b; }
      throw new Error('图片太大');
    } finally { URL.revokeObjectURL(url); }
  }

  /* ---------- the review panel (cards appear here as results come in) ---------- */
  let panel = null, queue = [], running = 0, done = 0, total = 0, stopped = false;
  function openPanel(title) {
    if (panel) return panel;
    document.body.insertAdjacentHTML('beforeend', `<div class="ra-bg" id="raBg"><section class="ra" role="dialog" aria-modal="true" aria-label="${title}">
      <header class="ra-h"><h2>${title}</h2><button type="button" class="btn btn-sm btn-icon" data-ra-close aria-label="关闭">${C.ic('x')}</button></header>
      <div class="ra-prog" id="raProg" hidden><span></span><i><b></b></i></div><div class="ra-msg" id="raMsg" hidden></div>
      <div class="ra-list" id="raList"></div></section></div>`);
    panel = $('#raBg'); C.icons(panel);
    panel.addEventListener('click', e => { if (e.target.closest('[data-ra-close]')) closePanel(); });
    return panel;
  }
  function closePanel() { if (!panel) return; panel.querySelectorAll('.rc').forEach(c => c._map && c._map.remove()); panel.remove(); panel = null; queue = []; stopped = true; }
  function progress() {
    const p = $('#raProg'); if (!p) return; p.hidden = !total;
    p.querySelector('span').textContent = done < total ? `正在识别 ${Math.min(done + running, total)} / ${total}` : `识别完了 ${total} 张`;
    p.querySelector('b').style.width = (total ? done / total * 100 : 0) + '%';
  }
  const msg = (t, html = '') => { const m = $('#raMsg'); if (!m) return; m.hidden = !t; m.innerHTML = t ? `${C.esc(t)}${html}` : ''; C.icons(m); };

  /* ---------- 从截图添加 ---------- */
  function pickScreens() {
    openPanel('从截图添加');
    $('#raList').insertAdjacentHTML('afterbegin', `<div class="ra-intro" id="raIntro"><p class="sub">${C.ic('shield-alert', 'i18')}免费识别服务可能会用上传的图片改进产品，有聊天记录或个人信息的截图请先裁剪。</p>
      <label class="btn btn-primary">${C.ic('images', 'i18')}选择截图（最多 ${MAX_FILES} 张）<input type="file" accept="image/*" multiple hidden id="raFiles"></label></div>`);
    C.icons($('#raIntro'));
    $('#raFiles').addEventListener('change', e => {
      const files = [...e.target.files].slice(0, MAX_FILES); if (!files.length) return;
      if (e.target.files.length > MAX_FILES) C.toast(`一次最多 ${MAX_FILES} 张，先识别前 ${MAX_FILES} 张`);
      $('#raIntro').remove(); stopped = false; msg('');
      files.forEach((f, i) => queue.push({ file: f, n: total + i + 1 })); total += files.length; progress(); pump();
    });
  }
  function pump() {
    while (!stopped && running < PARALLEL && queue.length) {
      const job = queue.shift(); running++; progress();
      recognizeOne(job).finally(() => { running--; done++; progress(); pump(); });
    }
  }
  async function recognizeOne(job) {
    try {
      const fd = new FormData(); fd.append('image', await compress(job.file), 'shot.jpg');
      const j = await call('/recognize', fd);
      if (!j.places || !j.places.length) return failCard(job, '这张截图没认出地点', false);
      j.places.forEach(p => addCard(p));
    } catch (e) {
      if (e.code === 'quota') { stopped = true; done += queue.length; queue = []; msg(e.message, ` <button type="button" class="btn btn-sm" data-ra-search>${C.ic('search', 'i18')}粘贴店名</button>`); return; }
      failCard(job, e.message || '识别失败', true);
    }
  }
  function failCard(job, text, canRetry) {
    const list = $('#raList'); if (!list) return;
    list.insertAdjacentHTML('beforeend', `<article class="rc rc-fail"><p>${C.ic('image-off', 'i18')}第 ${job.n} 张：${C.esc(text)}</p><div class="rc-acts">
      ${canRetry ? '<button type="button" class="btn btn-sm" data-retry>重试</button>' : ''}<button type="button" class="btn btn-sm" data-manual>手动添加</button><button type="button" class="btn btn-sm ghost" data-skip>关掉</button></div></article>`);
    const card = list.lastElementChild; C.icons(card);
    card.addEventListener('click', e => {
      if (e.target.closest('[data-retry]')) { card.remove(); total++; queue.push(job); stopped = false; progress(); pump(); }
      if (e.target.closest('[data-manual]')) { closePanel(); C.openForm(null); }
      if (e.target.closest('[data-skip]')) card.remove();
    });
  }

  /* ---------- 粘贴链接 ---------- */
  function pasteLink() {
    openPanel('粘贴链接');
    $('#raList').insertAdjacentHTML('afterbegin', `<form class="ra-intro" id="raLink"><label class="tf">Naver、Kakao、高德、大众点评、小红书、谷歌地图的分享链接或分享文字
      <textarea name="t" rows="3" maxlength="2000" placeholder="粘贴到这里"></textarea></label><button class="btn btn-primary" type="submit">${C.ic('sparkles', 'i18')}识别</button></form>`);
    C.icons($('#raLink'));
    $('#raLink').addEventListener('submit', async e => {
      e.preventDefault(); const t = e.target.elements.t.value.trim(); if (!t) return;
      const b = e.target.querySelector('button'); b.disabled = true; msg('识别中…');
      try { const j = await call('/recognize-text', { text: t }); msg(j.places.length ? '' : '没认出地点，可以试试「粘贴店名」'); j.places.forEach(p => addCard(p)); e.target.remove(); }
      catch (er) { msg(er.message); }
      b.disabled = false;
    });
  }

  /* ---------- 粘贴店名 (no AI: Kakao / 高德 / OSM search) ---------- */
  function pasteName() {
    openPanel('粘贴店名');
    const city = C.currentCity() || '', cities = [...new Set(['首尔', '成都', ...C.favs().map(f => f.city).filter(Boolean)])];
    const ccOf = c => CITY_CC[c] || (C.favs().find(f => f.city === c && f.countryCode) || {}).countryCode || '';
    $('#raList').insertAdjacentHTML('afterbegin', `<form class="ra-intro" id="raName"><label class="tf">店名（可以用 iPhone 实况文本从截图里复制）<input name="q" maxlength="80" autocomplete="off" required></label>
      <div class="tf-row"><label class="tf">城市<input name="city" list="raCities" value="${C.esc(city)}"><datalist id="raCities">${cities.map(c => `<option value="${C.esc(c)}">`).join('')}</datalist></label>
        <label class="tf">国家 / 地区<select name="cc">${Object.entries(COUNTRY).map(([k, n]) => `<option value="${k}" ${k === ccOf(city) ? 'selected' : ''}>${n}</option>`).join('')}<option value="">其他</option></select></label></div>
      <button class="btn btn-primary" type="submit">${C.ic('search', 'i18')}搜索</button><div class="ra-res" id="raRes"></div></form>`);
    const f = $('#raName'); C.icons(f);
    f.elements.city.addEventListener('change', () => { const cc = ccOf(f.elements.city.value.trim()); if (cc) f.elements.cc.value = cc; });
    f.addEventListener('submit', async e => {
      e.preventDefault(); const q = f.elements.q.value.trim(), city = f.elements.city.value.trim(), cc = f.elements.cc.value; if (!q) return;
      const box = $('#raRes'); box.innerHTML = '<p class="sub">搜索中…</p>';
      try {
        const { results } = await call('/search', { q, city, country: cc });
        box.innerHTML = results.length ? results.map((r, i) => `<button type="button" class="ra-pick" data-i="${i}"><b>${C.esc(r.name)}</b><span>${C.esc(r.address)}</span></button>`).join('') : '<p class="sub">没找到，换个写法，或者换成当地语言的店名试试。</p>';
        box.onclick = ev => { const b = ev.target.closest('[data-i]'); if (!b) return; const r = results[+b.dataset.i];
          addCard({ name: r.name, nameZh: '', address: r.address, city, district: '', country: cc, category: 'food', cuisine: '', price: '', source: 'search', confidence: 1, candidates: [r] }, true);
          box.innerHTML = ''; f.elements.q.value = ''; };
      } catch (er) { box.innerHTML = `<p class="sub">${C.esc(er.message)}</p>`; }
    });
    f.elements.q.focus();
  }

  /* ---------- confirmation card: confirm the spot, tap stars, save ---------- */
  function addCard(p, picked = false) {
    const list = $('#raList'); if (!list) return;
    const cands = (p.candidates || []).filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lng));
    const st = { status: 'been', rating: 0, cat: p.category in C.CATS ? p.category : 'other', loc: cands[0] ? [cands[0].lat, cands[0].lng] : null,
      needConfirm: !picked && (p.confidence < 0.6 || !cands.length), confirmed: picked };
    const [icn, , col] = C.CATS[st.cat];
    const title = p.nameZh && p.nameZh !== p.name ? `${p.nameZh}<small>${C.esc(p.name)}</small>` : C.esc(p.nameZh || p.name);
    list.insertAdjacentHTML('beforeend', `<article class="rc">
      <p class="rc-warn" ${st.needConfirm ? '' : 'hidden'}>${C.ic('triangle-alert', 'i18')}${cands.length ? '不太确定，请确认位置：选一个候选，或在小地图上拖动标记' : '没找到坐标，请在小地图上点一下放标记'}</p>
      <div class="rc-map"></div>
      <div class="rc-head"><span class="emo" style="--c:${col}">${C.ic(icn)}</span><div><b>${title}</b>
        <div class="m">${C.esc([p.city, p.district, p.cuisine, p.price].filter(Boolean).join(' · '))}</div>${p.address ? `<div class="m">${C.esc(p.address)}</div>` : ''}</div></div>
      <div class="seg rc-st" role="group" aria-label="去过还是想去"><button type="button" data-st="been" class="on">去过</button><button type="button" data-st="want">想去</button></div>
      <div class="starpick big" role="radiogroup" aria-label="评分">${[1, 2, 3, 4, 5].map(i => `<button type="button" data-v="${i}" role="radio" aria-checked="false" aria-label="${i} 星">${C.ic('star')}</button>`).join('')}</div>
      <div class="rc-dup" hidden></div>
      <div class="rc-alt" hidden>${cands.map((c, i) => `<label class="rc-c"><input type="radio" name="c${Math.random().toString(36).slice(2, 7)}" value="${i}" ${i === 0 ? 'checked' : ''}><span><b>${C.esc(c.name)}</b>${C.esc(c.address)}</span></label>`).join('') || '<p class="sub">没有候选位置。</p>'}
        <p class="sub">也可以直接在小地图上拖动标记，或点一下换位置。</p></div>
      <div class="rc-edit" hidden><label class="tf">名称<input name="name" maxlength="60" value="${C.esc(p.nameZh || p.name)}"></label>
        <div class="tf-row"><label class="tf">类型<select name="cat">${Object.entries(C.CATS).map(([k, [, n]]) => `<option value="${k}" ${k === st.cat ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="tf">城市<input name="city" maxlength="30" value="${C.esc(p.city)}"></label></div>
        <label class="tf">短评<textarea name="note" rows="2" maxlength="500"></textarea></label><label class="tf">标签（逗号分开）<input name="tags" value="${C.esc(p.cuisine)}"></label></div>
      <div class="rc-acts"><button type="button" class="btn btn-sm ghost" data-alt>${C.ic('map-pin', 'i18')}位置不对？</button><button type="button" class="btn btn-sm ghost" data-edit>${C.ic('pencil', 'i18')}编辑</button>
        <button type="button" class="btn btn-sm ghost" data-skip>跳过</button><button type="button" class="btn btn-sm btn-primary" data-save disabled>保存</button></div></article>`);
    const card = list.lastElementChild; C.icons(card);
    // mini map with a draggable marker
    const center = st.loc || C.mapCenter();
    const m = L.map(card.querySelector('.rc-map'), { zoomControl: false, attributionControl: false }).setView(center, st.loc ? 16 : 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'tiles' }).addTo(m);
    let mk = null;
    const place = (ll, confirm) => { st.loc = [+ll[0].toFixed(6), +ll[1].toFixed(6)];
      if (mk) mk.setLatLng(st.loc); else { mk = L.marker(st.loc, { draggable: true }).addTo(m); mk.on('dragend', () => { const g = mk.getLatLng(); place([g.lat, g.lng], true); }); }
      if (confirm) st.confirmed = true; refresh(); };
    if (st.loc) place(st.loc, false);
    m.on('click', e => place([e.latlng.lat, e.latlng.lng], true));
    card._map = m; setTimeout(() => m.invalidateSize(), 60);
    function refresh() {
      const ok = st.loc && (!st.needConfirm || st.confirmed) && (st.status === 'want' || st.rating > 0);
      card.querySelector('[data-save]').disabled = !ok;
      card.querySelector('.rc-warn').hidden = !st.needConfirm || st.confirmed;
      card.querySelector('.starpick').classList.toggle('off', st.status === 'want');
    }
    card.addEventListener('change', e => { if (e.target.type === 'radio') { const c = cands[+e.target.value]; place([c.lat, c.lng], true); m.setView(st.loc, 16); }
      if (e.target.name === 'cat') st.cat = e.target.value; });
    card.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.v) { st.rating = +b.dataset.v; if (st.status === 'want') setStatus('been');
        card.querySelectorAll('.starpick button').forEach(x => { x.classList.toggle('on', +x.dataset.v <= st.rating); x.setAttribute('aria-checked', +x.dataset.v === st.rating); }); refresh(); }
      if (b.dataset.st) setStatus(b.dataset.st);
      if (b.dataset.alt !== undefined) { const a = card.querySelector('.rc-alt'); a.hidden = !a.hidden; }
      if (b.dataset.edit !== undefined) { const ed = card.querySelector('.rc-edit'); ed.hidden = !ed.hidden; }
      if (b.dataset.skip !== undefined) { m.remove(); card.remove(); }
      if (b.dataset.save !== undefined) save(false);
      if (b.dataset.dupUpdate !== undefined) save('update');
      if (b.dataset.dupNew !== undefined) save('new');
    });
    function setStatus(s) { st.status = s; card.querySelectorAll('.rc-st button').forEach(x => x.classList.toggle('on', x.dataset.st === s)); refresh(); }
    async function save(mode) {
      const f = k => card.querySelector(`.rc-edit [name="${k}"]`).value.trim();
      const name = f('name') || p.nameZh || p.name, city = f('city');
      // 去重: same name within 100 m
      const dup = C.favs().find(x => [x.name, x.nameLocal].some(n => n && [name, p.name, p.nameZh].some(y => y && norm(y) === norm(n))) && metres([x.lat, x.lng], st.loc) <= 100);
      const box = card.querySelector('.rc-dup');
      if (dup && !mode) { box.hidden = false; box.innerHTML = `<p>${C.ic('copy', 'i18')}已经收藏过「${C.esc(dup.name)}」，${dup.status === 'want' ? '标的是想去' : `评分 ${dup.rating}★`}</p>
          <div class="rc-acts"><button type="button" class="btn btn-sm btn-primary" data-dup-update>更新评分</button><button type="button" class="btn btn-sm" data-dup-new>仍然新增</button></div>`; C.icons(box); return; }
      const now = Date.now(), tags = f('tags').split(/[,，、\s]+/).map(t => t.slice(0, 12)).filter(Boolean).slice(0, 8);
      const sb = card.querySelector('[data-save]'); sb.disabled = true;
      try {
        if (mode === 'update' && dup) {
          await C.db().collection('favorites').doc(dup.id).update({ status: st.status, rating: st.status === 'want' ? (dup.rating || 0) : st.rating,
            ...(st.status === 'been' && !dup.visitedAt ? { visitedAt: C.today() } : {}), updatedAt: now });
        } else {
          const cc = (p.country || '').toUpperCase();
          await C.db().collection('favorites').add({ name: name.slice(0, 60), category: st.cat, lat: st.loc[0], lng: st.loc[1], rating: st.status === 'want' ? 0 : st.rating,
            note: f('note').slice(0, 500), city: city.slice(0, 30), country: (COUNTRY[cc] || '').slice(0, 30), tripId: null, visitedAt: st.status === 'been' ? C.today() : null,
            price: 0, tags, link: '', private: false, at: now, updatedAt: now, status: st.status, nameLocal: (p.name || '').slice(0, 60), address: (p.address || '').slice(0, 200),
            district: (p.district || '').slice(0, 30), cuisine: (p.cuisine || '').slice(0, 20), source: p.source || 'other', countryCode: cc.slice(0, 2) });
        }
        C.toast(st.status === 'want' ? '已加到想去' : '已收藏'); m.remove(); card.classList.add('saved'); setTimeout(() => card.remove(), 400);
      } catch (er) { sb.disabled = false; C.toast(C.errMsg(er)); }
    }
  }

  /* ---------- ＋ menu ---------- */
  function menu() {
    if ($('#addMenu')) { $('#addMenu').remove(); return; }
    const ai = !!WORKER;
    document.body.insertAdjacentHTML('beforeend', `<div class="add-menu" id="addMenu" role="menu">
      <button type="button" data-a="shot" ${ai ? '' : 'disabled'}>${C.ic('scan-text')}<span><b>从截图添加</b><small>${ai ? '选几张截图，自动认出店名和位置' : '识别服务还没部署（worker/README.md）'}</small></span></button>
      <button type="button" data-a="name" ${ai ? '' : 'disabled'}>${C.ic('search')}<span><b>粘贴店名</b><small>不用 AI，搜店名找位置</small></span></button>
      <button type="button" data-a="link" ${ai ? '' : 'disabled'}>${C.ic('link')}<span><b>粘贴链接</b><small>Naver、小红书、大众点评等分享链接</small></span></button>
      <button type="button" data-a="manual">${C.ic('pencil')}<span><b>手动添加</b><small>自己填名称和位置</small></span></button></div>`);
    const el = $('#addMenu'); C.icons(el);
    el.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b || b.disabled) return; el.remove();
      ({ shot: pickScreens, name: pasteName, link: pasteLink, manual: () => C.openForm(null) })[b.dataset.a](); });
  }
  document.addEventListener('click', e => {
    if (e.target.closest('[data-ra-search]')) { closePanel(); pasteName(); }
    if ($('#addMenu') && !e.target.closest('#addMenu') && !e.target.closest('#fab')) $('#addMenu').remove();
  });

  window.FavAdd = { init(ctx) { C = ctx; }, menu, compress, WORKER };
})();
