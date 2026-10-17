// 行李 (packing) tab for index.html: per-member item states, custom items, progress rings,
// full-screen pre-departure check and per-hotel checkout lists.
// Data: packing/{m1..m4} = { items:{k:"done"|"skip"}, custom:[{k,label,cat}], checkout:{hyatt:{},fusion:{}}, at }
(function () {
  const C = 'carry', B = 'check'; // 随身 / 托运
  // default catalogue; each trip brings its own (info/static.packingItems) via Packing.setCatalog
  let CATS = [
    { id: 'docs', label: '证件', icon: 'id-card', items: [['passport', '护照', C], ['evisa', '电子签打印件或截图', C], ['itinerary', '机票行程单', C],
      ['hotelconf', '酒店确认单截图', C], ['ppcopy', '护照照片页复印件', B, '和护照分开放']] },
    { id: 'money', label: '钱', icon: 'banknote', items: [['vnd', '越南盾现金', C, '夜市和小店多数只收现金'], ['usd', '少量美元备用', C],
      ['card', 'Visa 或万事达卡', C], ['homecash', '一点人民币或韩元', C, '回国路上用']] },
    { id: 'elec', label: '电子', icon: 'smartphone', items: [['phone', '手机', C], ['cable', '充电线', C], ['powerbank', '充电宝', C, '必须随身，不能托运', 1],
      ['adapter', '转换头', C], ['earphones', '耳机', C]] },
    { id: 'clothes', label: '衣物', icon: 'shirt', items: [['tees', '短袖短裤', B], ['jacket', '薄外套', C, '卧铺大巴和飞机空调很冷', 1],
      ['umbrella', '雨衣或折叠伞', C, '芽庄 12 月底可能下雨', 1], ['swim', '泳衣', B], ['slippers', '拖鞋', B], ['pajamas', '睡衣', B], ['nye', '跨年夜穿的衣服', B]] },
    { id: 'toilet', label: '洗漱和防晒', icon: 'sun', items: [['toothbrush', '牙刷牙膏', B], ['sunscreen', '防晒霜', B, '超过 100ml 要托运', 1],
      ['repellent', '驱蚊液', B], ['aftersun', '晒后修复', B]] },
    { id: 'meds', label: '药品', icon: 'pill', items: [['stomach', '肠胃药', C], ['seasick', '晕船药', C, '1/1 跳岛', 1], ['bandaid', '创可贴', C], ['mymeds', '个人常用药', C]] },
    { id: 'island', label: '跳岛当天', icon: 'sailboat', items: [['drybag', '防水手机袋', B], ['towel', '毛巾', B], ['change', '换洗衣服', B]] },
    { id: 'bus', label: '大巴过夜', icon: 'bus', items: [['pillow', '颈枕', C], ['eyemask', '眼罩', C], ['earplugs', '耳塞', C], ['tissues', '纸巾和湿巾', C]] },
  ];
  const CHECKOUT = [['passport', '从前台拿回押的护照'], ['safe', '保险箱'], ['charger', '充电器和充电宝'], ['bath', '浴室里的东西'], ['closet', '衣柜和床头柜'], ['deposit', '退押金']];
  let STAYS = [];   // checkout lists per hotel stay, from info/static.stays
  const WHERE = { carry: '随身', check: '托运' };

  let pkArmed = '', pkArmedTimer = 0;   // custom item waiting for its second tap (delete)
  let ctx = null, data = {}, exists = new Set(), loaded = false, view = '', open = {}, check = null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const doc = id => data[id] || { items: {}, custom: [], checkout: { hyatt: {}, fusion: {} } };
  const itemsOf = (id, cat) => [...cat.items.map(([k, label, w, note, strong]) => ({ k, label, w, note, strong })),
    ...(doc(id).custom || []).filter(c => c.cat === cat.id).map(c => ({ k: c.k, label: c.label, custom: true }))];
  const stateOf = (id, k) => (doc(id).items || {})[k] || '';
  const progress = id => { let n = 0, d = 0; for (const cat of CATS) for (const it of itemsOf(id, cat)) { n++; if (stateOf(id, it.k)) d++; } return { n, d }; };
  const canWrite = () => ctx.ready() && loaded;
  const who = () => view || ctx.me() || 'm1';
  const av = id => ctx.avatar ? ctx.avatar(id) : ctx.nm(id).slice(0, 1);
  // desktop table: categories collapse; a category everyone has finished starts collapsed
  let deskOpen = {};
  const catDone = cat => ctx.IDS.every(id => itemsOf(id, cat).every(it => stateOf(id, it.k)));

  /* ---------- writes ---------- */
  async function ensure(id) {
    if (exists.has(id)) return; // local optimistic copies don't count: the server doc must exist
    const ref = ctx.db().doc('packing/' + id);
    await ctx.db().runTransaction(async tx => { const cur = await tx.get(ref);
      if (!cur.exists) tx.set(ref, { items: {}, custom: [], checkout: { hyatt: {}, fusion: {} }, at: Date.now() }); });
  }
  async function write(id, patch) {
    if (!canWrite()) return ctx.toast('还没连上数据库');
    try { await ensure(id); await ctx.db().doc('packing/' + id).set({ ...patch, at: Date.now() }, { merge: true }); }
    catch (e) { ctx.toast('保存失败，请稍后再试'); render(); }
  }
  const FV = () => firebase.firestore.FieldValue;
  function setItem(id, k, next) { // optimistic local update so taps feel instant
    const d = data[id] = { ...doc(id), items: { ...doc(id).items } };
    if (next) d.items[k] = next; else delete d.items[k];
    render();
    return write(id, { items: { [k]: next || FV().delete() } });
  }
  const toggle = (id, k, s) => setItem(id, k, stateOf(id, k) === s ? '' : s);
  const cycle = (id, k) => setItem(id, k, { '': 'done', done: 'skip', skip: '' }[stateOf(id, k)]);

  /* ---------- render ---------- */
  function ring(id) {
    const { n, d } = progress(id), full = n && d === n, r = 22, L = 2 * Math.PI * r;
    return `<button class="pk-ring${id === who() ? ' on' : ''}" data-pkview="${id}" style="--p:var(--${id})" aria-pressed="${id === who()}" aria-label="${esc(ctx.nm(id))} ${d} / ${n}">
      <svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="${r}" class="bg"/><circle cx="26" cy="26" r="${r}" class="fg" stroke-dasharray="${L}" stroke-dashoffset="${L * (1 - (n ? d / n : 0))}"/></svg>
      <span class="c">${full ? '<i data-lucide="check"></i>' : `${d}<small>/${n}</small>`}</span><span class="nm">${esc(ctx.nm(id))}</span></button>`;
  }
  const tag = it => it.w ? `<span class="pk-w ${it.w}">${WHERE[it.w]}</span>` : '';
  const sub = it => it.note ? `<small class="${it.strong ? 'strong' : ''}">${esc(it.note)}</small>` : '';
  function phoneList(id) {
    const dis = canWrite() ? '' : 'disabled';
    return CATS.map(cat => {
      const items = itemsOf(id, cat), d = items.filter(it => stateOf(id, it.k)).length, isOpen = open[cat.id] ?? d < items.length;
      return `<section class="pk-cat${isOpen ? ' open' : ''}">
        <button class="pk-cat-h" data-pkcat="${cat.id}" aria-expanded="${isOpen}"><i data-lucide="${cat.icon}"></i><b>${cat.label}</b><span class="pk-n${d === items.length ? ' ok' : ''}">${d} / ${items.length}</span><i data-lucide="chevron-down" class="chev"></i></button>
        <div class="pk-items">${items.map(it => { const s = stateOf(id, it.k); return `<div class="pk-it ${s}">
          <button class="pk-box" data-pkset="done" data-id="${id}" data-k="${esc(it.k)}" ${dis} aria-pressed="${s === 'done'}" aria-label="已带：${esc(it.label)}"><i data-lucide="check"></i></button>
          <span class="t"><span class="l">${esc(it.label)}</span>${tag(it)}${sub(it)}</span>
          ${it.custom ? `<button class="pk-x${pkArmed === id + ':' + it.k ? ' armed' : ''}" data-pkdel="${esc(it.k)}" data-id="${id}" ${dis} aria-label="${pkArmed === id + ':' + it.k ? '再点一次删除' : '删除'} ${esc(it.label)}">${pkArmed === id + ':' + it.k ? '确认删除？' : '<i data-lucide="trash-2"></i>'}</button>` : ''}
          <button class="pk-skip" data-pkset="skip" data-id="${id}" data-k="${esc(it.k)}" ${dis} aria-pressed="${s === 'skip'}">${s === 'skip' ? '不需要' : '不带'}</button></div>`; }).join('')}
          ${id === ctx.me() ? `<form class="pk-add" data-pkadd="${cat.id}"><input type="text" maxlength="30" placeholder="加一项自己的" aria-label="在${cat.label}里加一项"><button class="btn btn-sm ghost" ${dis}>添加</button></form>` : ''}
        </div></section>`;
    }).join('');
  }
  function table() {
    const ids = ctx.IDS, dis = canWrite() ? '' : 'disabled';
    let h = `<div class="pk-tr pk-th"><span></span>${ids.map(id => `<span class="${id === ctx.me() ? 'me' : ''}"><span class="av sm" style="--p:var(--${id})">${esc(av(id))}</span>${esc(ctx.nm(id))}</span>`).join('')}</div>`;
    for (const cat of CATS) {
      const done = catDone(cat), open = deskOpen[cat.id] ?? !done;
      h += `<div class="pk-tr pk-tc${done ? ' done' : ''}" id="pkc-${cat.id}"><button type="button" class="pk-tc-b" data-pkdcat="${cat.id}" aria-expanded="${open}"><i data-lucide="${cat.icon}" class="i18"></i>${cat.label}${done ? '<i data-lucide="circle-check" class="i18 ok"></i>' : ''}<i data-lucide="chevron-down" class="i18 chev"></i></button>${ids.map(id => { const it = itemsOf(id, cat); return `<span class="pk-n">${it.filter(x => stateOf(id, x.k)).length} / ${it.length}</span>`; }).join('')}</div>`;
      if (!open) continue;
      const rows = [...cat.items.map(([k, label, w, note, strong]) => ({ k, label, w, note, strong })),
        ...ids.flatMap(id => (doc(id).custom || []).filter(c => c.cat === cat.id).map(c => ({ k: c.k, label: c.label, owner: id })))];
      for (const it of rows) h += `<div class="pk-tr"><span class="t"><span class="l">${esc(it.label)}</span>${tag(it)}${it.owner ? `<span class="pk-w own" style="--p:var(--${it.owner})">${esc(ctx.nm(it.owner))}</span>` : ''}${sub(it)}</span>${ids.map(id => {
        if (it.owner && it.owner !== id) return '<span></span>';
        const s = stateOf(id, it.k);
        return `<span><button class="pk-cell ${s}" data-pkcycle="${esc(it.k)}" data-id="${id}" ${dis} aria-label="${esc(ctx.nm(id))}：${esc(it.label)}，${s === 'done' ? '已带' : s === 'skip' ? '不需要' : '未处理'}" title="点一下：已带 → 不需要 → 取消">${s === 'done' ? '<i data-lucide="check"></i>' : s === 'skip' ? '<i data-lucide="minus"></i>' : ''}</button>${it.owner ? `<button class="pk-x" data-pkdel="${esc(it.k)}" data-id="${id}" ${dis} aria-label="删除"><i data-lucide="trash-2"></i></button>` : ''}</span>`; }).join('')}</div>`;
    }
    return h;
  }
  function toc() {
    return CATS.map(cat => { let n = 0, d = 0; ctx.IDS.forEach(id => itemsOf(id, cat).forEach(it => { n++; if (stateOf(id, it.k)) d++; }));
      return `<a href="#pkc-${cat.id}" data-pktoc="${cat.id}" class="${d === n ? 'ok' : ''}"><span>${cat.label}</span><span class="num">${d} / ${n}</span></a>`; }).join('');
  }
  function checkout(id) {
    const co = doc(id).checkout || {}, dis = canWrite() ? '' : 'disabled';
    return STAYS.map(([s, label]) => { const m = co[s] || {}, d = CHECKOUT.filter(([k]) => m[k]).length;
      return `<div class="pk-co"><h3><i data-lucide="door-open" class="i18"></i>${label}<span class="pk-n${d === CHECKOUT.length ? ' ok' : ''}">${d} / ${CHECKOUT.length}</span></h3>
        ${CHECKOUT.map(([k, l]) => `<label class="pk-co-it"><input type="checkbox" data-pkco="${s}" data-k="${k}" data-id="${id}" ${m[k] ? 'checked' : ''} ${dis}><span>${l}</span></label>`).join('')}</div>`; }).join('');
  }
  function render() {
    if (!ctx) return;
    const id = who(), root = ctx.root;
    root.querySelector('#pkRings').innerHTML = ctx.IDS.map(ring).join('');
    // live updates rebuild the list: keep whatever is being typed into 「加一项自己的」 (and its focus)
    const typed = {}, act = document.activeElement, focused = act && act.closest && act.closest('[data-pkadd]') ? act.closest('[data-pkadd]').dataset.pkadd : null;
    root.querySelectorAll('[data-pkadd] input').forEach(i => { if (i.value) typed[i.closest('[data-pkadd]').dataset.pkadd] = i.value; });
    root.querySelector('#pkList').innerHTML = phoneList(id);
    root.querySelectorAll('[data-pkadd]').forEach(f => { const i = f.querySelector('input'), k = f.dataset.pkadd;
      if (typed[k]) i.value = typed[k]; if (k === focused) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } });
    root.querySelector('#pkTable').innerHTML = table();
    const t = root.querySelector('#pkToc'); if (t) t.innerHTML = toc();
    root.querySelector('#pkCoWho').innerHTML = `<span class="av sm" style="--p:var(--${id})">${esc(av(id))}</span>${esc(ctx.nm(id))} 的退房检查`;
    root.querySelector('#pkCo').innerHTML = checkout(id);
    const side = root.querySelector('.c-pk-side'); if (side) side.hidden = !STAYS.length;   // no hotel stays → no checkout card
    root.querySelector('#pkStart').disabled = !canWrite();
    ctx.icons();
  }

  /* ---------- check mode: one category at a time, only unhandled items ---------- */
  function startCheck() {
    const id = ctx.me();
    if (!id) { ctx.toast('先点右上角头像，选一下你是谁'); if (window.tripNav) tripNav.openPicker(); return; }
    const cats = id ? CATS.filter(c => itemsOf(id, c).some(it => !stateOf(id, it.k))).map(c => c.id) : [];
    check = { id, cats, i: 0 };
    document.getElementById('pkCheck').hidden = false; document.documentElement.style.overflow = 'hidden';
    drawCheck();
  }
  function closeCheck() { check = null; document.getElementById('pkCheck').hidden = true; document.documentElement.style.overflow = ''; render(); }
  function drawCheck() {
    const el = document.getElementById('pkCheckIn'), c = check;
    const cat = CATS.find(x => x.id === c.cats[c.i]);
    if (!cat) {
      el.innerHTML = `<div class="pk-done"><span class="pk-done-i"><i data-lucide="party-popper"></i></span><h2>都带齐了，出发吧</h2><p class="sub">${esc(ctx.nm(c.id))} 的 ${progress(c.id).n} 项行李都处理好了。</p><button class="btn btn-primary" data-pkclose>返回</button></div>`;
      return ctx.icons();
    }
    const items = itemsOf(c.id, cat);
    el.innerHTML = `<p class="pk-step"><b>${c.i + 1} / ${c.cats.length} 类</b> · ${esc(ctx.nm(c.id))}</p>
      <h2><i data-lucide="${cat.icon}"></i>${cat.label}</h2><p class="sub">点一下表示已经放进包里。</p>
      <div class="pk-big-list">${items.filter(it => !stateOf(c.id, it.k) || c.touched?.[it.k]).map(it => { const s = stateOf(c.id, it.k); return `<div class="pk-big-row">
        <button class="pk-big ${s}" data-pkbig="${esc(it.k)}" aria-pressed="${s === 'done'}"><span class="pk-box"><i data-lucide="check"></i></span><span class="t"><span class="l">${esc(it.label)}</span>${tag(it)}${sub(it)}</span></button>
        <button class="pk-skip big" data-pkbigskip="${esc(it.k)}" aria-pressed="${s === 'skip'}">${s === 'skip' ? '不需要' : '不带'}</button></div>`; }).join('')}</div>
      <button class="btn ghost" data-pknext>${c.i + 1 < c.cats.length ? '跳过这一类' : '完成'}</button>`;
    ctx.icons();
  }
  async function markInCheck(k, s) {
    const c = check; c.touched = { ...(c.touched || {}), [k]: 1 };
    await toggle(c.id, k, s);
    const cat = CATS.find(x => x.id === c.cats[c.i]);
    drawCheck();
    if (itemsOf(c.id, cat).every(it => stateOf(c.id, it.k))) setTimeout(() => { if (check === c && c.cats[c.i] === cat.id) { c.i++; c.touched = {}; drawCheck(); } }, 450);
  }

  /* ---------- events ---------- */
  function bind(root) {
    root.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t || t.disabled) return;
      if (t.dataset.pkview) { view = t.dataset.pkview; render(); }
      else if (t.dataset.pkcat) { const id = t.dataset.pkcat, el = t.closest('.pk-cat'); open[id] = !el.classList.contains('open'); render(); }
      else if (t.dataset.pkset) toggle(t.dataset.id, t.dataset.k, t.dataset.pkset);
      else if (t.dataset.pkcycle) cycle(t.dataset.id, t.dataset.pkcycle);
      else if (t.dataset.pkdcat) { const c = CATS.find(x => x.id === t.dataset.pkdcat); deskOpen[c.id] = !(deskOpen[c.id] ?? !catDone(c)); render(); }
      else if (t.dataset.pkdel) {
        const id = t.dataset.id, c = (doc(id).custom || []).find(x => x.k === t.dataset.pkdel);
        if (!c) return;
        // tap twice (the second tap confirms on the page; no native dialog)
        const key = id + ':' + c.k; clearTimeout(pkArmedTimer);
        if (pkArmed !== key) { pkArmed = key; render(); pkArmedTimer = setTimeout(() => { pkArmed = ''; render(); }, 3500); return; }
        pkArmed = ''; write(id, { custom: FV().arrayRemove(c), items: { [c.k]: FV().delete() } });
      } else if (t.id === 'pkStart') startCheck();
    });
    root.addEventListener('click', e => {
      const a = e.target.closest('[data-pktoc]'); if (!a) return; e.preventDefault();
      deskOpen[a.dataset.pktoc] = true; render();
      // where the sticky table header ends once stuck (its CSS top + height), not where it is right now
      const th = root.querySelector('.pk-th'), row = root.querySelector('#pkc-' + a.dataset.pktoc), off = th ? parseFloat(getComputedStyle(th).top) + th.offsetHeight : 200;
      if (row) scrollTo({ top: scrollY + row.getBoundingClientRect().top - off - 8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
    // highlight the category currently under the sticky header
    let raf = 0;
    addEventListener('scroll', () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0;
      const head = root.querySelector('.pk-th'); if (!head || !head.offsetParent) return; const line = head.getBoundingClientRect().bottom + 12;
      let curId = CATS[0].id; CATS.forEach(c => { const r = root.querySelector('#pkc-' + c.id); if (r && r.getBoundingClientRect().top <= line) curId = c.id; });
      root.querySelectorAll('[data-pktoc]').forEach(a => a.classList.toggle('on', a.dataset.pktoc === curId)); }); }, { passive: true });
    root.addEventListener('submit', e => {
      const f = e.target.closest('[data-pkadd]'); if (!f) return; e.preventDefault();
      const id = ctx.me(), label = f.querySelector('input').value.trim().slice(0, 30);
      if (!id) { ctx.toast('先点右上角头像，选一下你是谁'); if (window.tripNav) tripNav.openPicker(); return; }
      if (!label) return;
      if ((doc(id).custom || []).length >= 30) return ctx.toast('自定义最多 30 项');
      const k = 'c_' + Math.random().toString(16).slice(2, 6);
      f.querySelector('input').value = '';
      write(id, { custom: FV().arrayUnion({ k, label, cat: f.dataset.pkadd }) });
    });
    root.addEventListener('change', e => {
      const t = e.target; if (!t.dataset.pkco) return;
      write(t.dataset.id, { checkout: { [t.dataset.pkco]: { [t.dataset.k]: t.checked ? true : FV().delete() } } });
    });
    const ov = document.getElementById('pkCheck');
    ov.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.pkclose !== undefined) closeCheck();
      else if (t.dataset.pkbig) markInCheck(t.dataset.pkbig, 'done');
      else if (t.dataset.pkbigskip) markInCheck(t.dataset.pkbigskip, 'skip');
      else if (t.dataset.pknext !== undefined) { check.i++; check.touched = {}; drawCheck(); }
    });
    addEventListener('keydown', e => { if (e.key === 'Escape' && check) closeCheck(); });
  }

  window.Packing = {
    get CATS() { return CATS; },
    setCatalog(cats, stays) { if (cats && cats.length) CATS = cats; STAYS = stays || []; if (ctx) render(); },
    init(c) { ctx = c; bind(c.root); render(); },
    subscribe(db) {
      db.collection('packing').onSnapshot(s => {
        loaded = true; data = {}; exists = new Set(); s.docs.forEach(d => { data[d.id] = d.data(); exists.add(d.id); });
        render(); if (check) drawCheck(); if (ctx.onData) ctx.onData();
      }, () => {});
    },
    render,
    progress: id => ctx ? progress(id) : { n: 0, d: 0 },
  };
})();
