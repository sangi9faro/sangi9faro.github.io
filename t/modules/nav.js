// /t/ shared in-trip navigation (guide.html, index.html, vote.html) for every trip.
// Phone: top bar (back + title) and a bottom tab bar; ≥768px: left rail (icons, labels from 1440px).
// <script src="modules/nav.js" data-title="工具箱" data-top="1"></script> placed right after <body>, after core.js.
(function () {
  const s = document.currentScript, HUB = '/';
  const showTop = s.dataset.top !== '0', title = s.dataset.title || document.title;
  // links keep ?id=…; 行李 lives inside 工具箱 (capsule tab); 账单 has its own entry
  const L = (page, hash) => window.Trip ? Trip.link(page, hash) : page + (hash ? '#' + hash : '');
  const ITEMS = [['guide', '行程', 'map', L('guide.html')], ['toolbox', '工具箱', 'briefcase', L('index.html', 'tools')], ['bills', '账单', 'receipt', L('index.html', 'bills')], ['vote', '投票', 'vote', L('vote.html')]];
  const current = () => /guide\.html$/.test(location.pathname) ? 'guide' : /vote\.html$/.test(location.pathname) ? 'vote' : (/^#(aa|bills)$/.test(location.hash) ? 'bills' : 'toolbox');
  const link = ([id, label, icon, href], cls) => `<a href="${href}" data-tn="${id}" data-tip="${label}" aria-label="${label}"${cls ? ` class="${cls}"` : ''}><i data-lucide="${icon}"></i><span>${label}</span></a>`;
  document.body.classList.add('tn');
  if (showTop) document.body.insertAdjacentHTML('afterbegin', `<header class="tn-top"><a class="tn-back" href="${HUB}"><i data-lucide="chevron-left"></i>我的旅行</a><h1>${title}</h1><span class="tn-spacer"></span><button type="button" class="tn-me" hidden aria-haspopup="menu" aria-expanded="false"></button></header>`);
  document.body.insertAdjacentHTML('beforeend',
    `<nav class="tn-rail" aria-label="旅行导航"><a class="tn-home" href="${HUB}" data-tip="我的旅行" aria-label="我的旅行"><i data-lucide="chevron-left"></i><span>我的旅行</span></a>${ITEMS.map(i => link(i)).join('')}</nav>` +
    `<nav class="tn-tabs" aria-label="旅行导航">${ITEMS.map(i => link(i)).join('')}</nav>`);
  function update() { const c = current(); document.querySelectorAll('[data-tn]').forEach(a => { if (a.dataset.tn === c) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }); }
  update(); addEventListener('hashchange', update);
  // expose the top bar height so pages can stick their own bars right under it
  const top = document.querySelector('.tn-top');
  const setH = () => document.documentElement.style.setProperty('--tn-top-h', (top ? top.offsetHeight : 0) + 'px');
  setH(); if (top && window.ResizeObserver) new ResizeObserver(setH).observe(top);
  const setTitle = t => { const h = document.querySelector('.tn-top h1'); if (h) h.textContent = t; };
  // ── 我是谁 (stored as localStorage 'trip-me'), shared by every page that calls tripNav.configure ──
  let IDS = ['m1', 'm2', 'm3', 'm4'];
  let cfg = null, members = {}, me = '';
  const ME_KEY = window.Trip ? 'trip-me:' + Trip.id : 'trip-me';
  try { me = localStorage.getItem(ME_KEY) || ''; } catch (e) {}
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // avatar letter: 成员A → A; otherwise the first character, or the last one if another member starts the same way
  function initial(id, names) {
    const n = String((names || members)[id] || id).trim(), m = /^成员\s*([A-Za-z0-9])$/.exec(n);
    if (m) return m[1].toUpperCase();
    const first = [...n][0] || '?', clash = IDS.some(o => o !== id && [...String((names || members)[o] || '').trim()][0] === first);
    return clash ? [...n].pop() : first;
  }
  window.tripInitial = initial;
  const btn = document.querySelector('.tn-me'), menu = document.createElement('div');
  menu.className = 'tn-menu'; menu.hidden = true; menu.setAttribute('role', 'menu'); document.body.appendChild(menu);
  function drawMe() {
    if (!btn || !cfg) return;
    btn.hidden = false;
    btn.innerHTML = me ? `<span class="av" style="--p:var(--${me})">${esc(initial(me))}</span><span class="nm">${esc(members[me] || me)}</span>`
      : `<span class="av none"><i data-lucide="user-round"></i></span><span class="nm">我是谁</span>`;
    btn.setAttribute('aria-label', me ? `我是 ${members[me] || me}，点击切换` : '选一下我是谁');
    icons();
  }
  function openMenu() {
    // once chosen, 我是谁 is locked on this device; 「我不是这个人」 unlocks it (avoids tapping someone else by accident)
    menu.innerHTML = me
      ? `<p>这台设备是</p><button type="button" role="menuitemradio" aria-checked="true" data-me="${me}"><span class="av sm" style="--p:var(--${me})">${esc(initial(me))}</span>${esc(members[me] || me)}<i data-lucide="check" class="ck"></i></button>
         <button type="button" class="tn-edit" data-not-me><i data-lucide="user-x"></i>我不是${esc(members[me] || '这个人')}</button>`
      : `<p>我是谁（只存在这台设备上）</p>` + IDS.map(id => `<button type="button" role="menuitemradio" aria-checked="false" data-me="${id}"><span class="av sm" style="--p:var(--${id})">${esc(initial(id))}</span>${esc(members[id] || id)}</button>`).join('')
    menu.innerHTML += cfg.onEditNames ? `<hr><button type="button" class="tn-edit" data-edit-names><i data-lucide="users"></i>修改成员名字</button>` : '';

    menu.hidden = false; btn && btn.setAttribute('aria-expanded', 'true'); icons();
    (menu.querySelector('[aria-checked="true"]') || menu.querySelector('button')).focus();
  }
  const closeMenu = () => { menu.hidden = true; btn && btn.setAttribute('aria-expanded', 'false'); };
  if (btn) btn.addEventListener('click', e => { e.stopPropagation(); menu.hidden ? openMenu() : closeMenu(); });
  menu.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.me) { if (b.dataset.me === me) { closeMenu(); return; } me = b.dataset.me; try { localStorage.setItem(ME_KEY, me); } catch (er) {} if (window.Trip) Trip.setMe(me); closeMenu(); drawMe(); cfg.onChange && cfg.onChange(me); }
    else if (b.dataset.editNames !== undefined) { closeMenu(); cfg.onEditNames(); }
    else if (b.dataset.notMe !== undefined) { me = ''; try { localStorage.removeItem(ME_KEY); } catch (er) {} if (window.Trip) Trip.setMe(''); drawMe(); cfg.onChange && cfg.onChange(''); openMenu(); }
  });
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { closeMenu(); btn && btn.focus(); } });
  // modules switched off for this trip disappear from the rail and the tab bar
  function applyModules(mods) {
    if (!mods) return;
    const off = { guide: mods.guide === false, bills: mods.bills === false, vote: mods.vote === false };
    document.querySelectorAll('[data-tn]').forEach(a => { a.hidden = !!off[a.dataset.tn]; });
    const n = [...document.querySelectorAll('.tn-tabs [data-tn]')].filter(a => !a.hidden).length;
    const tabs = document.querySelector('.tn-tabs'); if (tabs) tabs.style.gridTemplateColumns = `repeat(${n},1fr)`;
  }
  const configure = c => { cfg = { ...(cfg || {}), ...c }; if (c.members) { members = { ...c.members }; IDS = Object.keys(members).sort(); }
    if (window.Trip && Trip.me !== undefined) me = Trip.me;
    if (c.modules) applyModules(c.modules); if (c.title) setTitle(c.title + (title ? ' · ' + title : ''));
    drawMe(); };
  const setMembers = m => { members = { ...m }; IDS = Object.keys(members).sort(); drawMe(); };
  const openPicker = () => { if (cfg) openMenu(); };
  window.tripNav = { update, setTitle, configure, setMembers, openPicker, getMe: () => me, initial };
  const icons = () => { try { if (window.lucide) lucide.createIcons({ attrs: { 'stroke-width': 1.75 } }); } catch (e) {} };
  if (window.lucide) icons(); else addEventListener('DOMContentLoaded', icons);
})();
