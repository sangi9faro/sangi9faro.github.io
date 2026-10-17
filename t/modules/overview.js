// Guide overview (总览): 下一步 card, shortcut buttons with live status, day strip, panels.
// Uses guide.html globals at call time: DAYS, esc, memberName, me, dayHex, go, selectLoc, openAS, icons, TYPE_ICON, TripRoutes.
// Live data (expenses, settlements, group checklist, packing, rates) is pushed in with GuideOverview.setData().
(function () {
  // everything trip-specific comes from Trip (trips/{id}) and info/static (notices, highlight)
  const DAY = 864e5;
  let IDS = [], TRIP_START = Infinity, TRIP_END = Infinity, NDAYS = 0;
  function syncTrip() {
    IDS = Trip.memberIds(); TRIP_START = Trip.startMs(); TRIP_END = Trip.endMs() + 6 * 3600e3;   // late-night flights after the last day
    NDAYS = Math.max(1, Math.round((Trip.endMs() + 1000 - TRIP_START) / DAY));
  }
  const tzMs = () => Trip.tz() * 3600e3;
  const L = (page, hash) => Trip.link(page, hash);
  // ?now=2026-12-30T15:00+07:00 simulates another moment (testing only)
  const now = () => { const q = new URLSearchParams(location.search).get('now'); const t = q ? Date.parse(q) : NaN; return isFinite(t) ? t : Date.now(); };
  const data = { expenses: [], settlements: [], group: {}, packing: {}, rates: { VND: 3650, KRW: 195, USD: 0.14 } };
  const nm = id => esc(memberName(id) || id);
  const yuan = n => '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rate = c => c === 'CNY' ? 1 : (data.rates[c] || 1);
  const dayStart = id => TRIP_START + (id - 1) * DAY;
  const vnDate = t => { const d = new Date(t + tzMs()); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };

  // "05:40", "03:30 后", "1/4 00:10", "下午", "全天" → a timestamp (Vietnam time), or null when it can't be told
  const WORDS = [['凌晨', 3 * 60], ['上午', 9 * 60], ['中午', 12 * 60], ['下午', 14 * 60], ['傍晚', 17 * 60 + 30], ['晚上', 19 * 60], ['夜里', 22 * 60], ['全天', 9 * 60], ['入住', 15 * 60]];
  function locTime(l, dayId) {
    const t = String(l.time || ''); if (!t || t === '—') return null;
    let base = dayStart(dayId);
    const md = /(\d{1,2})\/(\d{1,2})/.exec(t);
    if (md) {   // "1/4 00:10": an explicit date; the year follows the trip (a month before the start month = next year)
      const sy = new Date(TRIP_START + tzMs()).getUTCFullYear(), sm = new Date(TRIP_START + tzMs()).getUTCMonth() + 1, y = +md[1] < sm ? sy + 1 : sy;
      base = Date.UTC(y, +md[1] - 1, +md[2]) - tzMs(); }
    const hm = /(\d{1,2}):(\d{2})/.exec(t.replace(/^\d{1,2}\/\d{1,2}\s*/, ''));
    if (hm) return base + (+hm[1] * 60 + +hm[2]) * 60e3;
    const w = WORDS.find(([k]) => t.includes(k)); return w ? base + w[1] * 60e3 : null;
  }
  const mainOf = d => (d && d.locations || []).filter(l => l.time !== '—' && l.lat);

  /* ---------- 下一步 ---------- */
  function nextCard() {
    const t = now();
    if (t < TRIP_START) {
      const ms = TRIP_START - t, d = Math.floor(ms / DAY), h = Math.floor(ms % DAY / 3600e3);
      const todo = window.TRIP_GROUP.find(([k]) => !(data.group[k] || {}).done);
      return `<div class="ov-next"><p class="k">下一步 · 出发倒计时</p>
        <h2><b class="num">${d}</b> 天 <b class="num">${h}</b> 小时</h2>
        ${todo ? `<a class="ov-todo" href="${L('index.html', 'check')}"><i data-lucide="clipboard-list"></i><span>还要办：${esc(todo[1])}</span><i data-lucide="chevron-right"></i></a>`
          : `<p class="ov-ok"><i data-lucide="circle-check"></i>集体要办的都办好了</p>`}</div>`;
    }
    if (t >= TRIP_END) {
      const total = window.TripMoney ? TripMoney.balances(data.expenses, data.settlements, IDS, rate).total : 0;
      return `<a class="ov-next" href="${L('index.html', 'bills')}"><p class="k">旅行结束啦</p><h2>这次一共花了 <b class="num">${yuan(total)}</b></h2>
        <span class="ov-todo"><i data-lucide="wallet"></i><span>去账单看看谁还没结清</span><i data-lucide="chevron-right"></i></span></a>`;
    }
    const today = Math.min(NDAYS, Math.floor((t - TRIP_START) / DAY) + 1);
    const pick = id => mainOf(DAYS.find(d => d.id === id)).map(l => ({ l, at: locTime(l, id), id }));
    let next = pick(today).find(x => x.at !== null && x.at >= t), label = '下一站';
    if (!next) { const tm = pick(today + 1); next = tm[0]; label = '明天第一站'; }
    if (!next) return `<div class="ov-next"><p class="k">下一步</p><h2>今天的行程都结束了</h2><p class="sub">好好休息，记得记账。</p></div>`;
    const l = next.l;
    return `<div class="ov-next"><p class="k">${label} · D${next.id} ${vnDate(dayStart(next.id))}</p>
      <h2><i data-lucide="${TYPE_ICON[l.type] || 'map-pin'}"></i>${esc(l.name)}</h2>
      <p class="sub num">${esc(l.time)}</p>
      <div class="row"><button type="button" class="btn btn-primary btn-sm" data-ovnav="${esc(l.id)}"><i data-lucide="navigation" class="i18"></i>导航</button>
        <button type="button" class="btn btn-sm" data-ovday="${next.id}">看这一天</button></div></div>`;
  }
  // dismissible notices from info/static ({ text, until }); {mN} = member names
  const warnKey = i => `guide-notice:${Trip.id}:${i}`;
  function warnBar() {
    return (window.TRIP_NOTICES || []).map((n, i) => {
      let off = false; try { off = localStorage.getItem(warnKey(i)) === '1'; } catch (e) {}
      const until = n.until ? Date.UTC(+n.until.slice(0, 4), +n.until.slice(5, 7) - 1, +n.until.slice(8, 10)) - tzMs() : Infinity;
      if (off || now() >= until) return '';
      return `<div class="ov-warn" role="note"><i data-lucide="triangle-alert"></i><span>${esc(n.text).replace(/\{(m\d)\}/g, (_, id) => nm(id))}</span>
        <button type="button" class="ov-x" data-ovwarn="${i}" aria-label="关闭提示"><i data-lucide="x"></i></button></div>`; }).join('');
  }

  /* ---------- shortcut status (all computed from live data) ---------- */
  const groupDone = k => !!(data.group[k] || {}).done;
  function status() {
    const fl = window.TRIP_FLIGHTS || [], people = new Set(fl.map(f => f.who)).size, pend = fl.filter(f => f.status !== 'ticketed').length;
    const hotels = window.TRIP_HOTELS || [], unbooked = hotels.filter(h => h.task ? !groupDone(h.task) : h.booked === false).length;
    const tr = (window.TRIP_TRANSPORT || []).filter(x => !groupDone(x.task)).length;
    const H = window.TRIP_HIGHLIGHT, re = H && H.match ? new RegExp(H.match) : null;
    const hd = H ? mainOf(DAYS.find(d => d.id === H.day)) : [], nye = re ? (hd.find(l => re.test(l.name)) || hd.find(l => re.test(l.desc || ''))) : null;   // name first: other stops mention it in passing
    const s = {
      flights: { t: `${people}人·${pend}张待出票`, warn: pend > 0 },   // compact so it fits one line at 390px
      hotels: { t: `${hotels.length}家·${unbooked}家未订`, warn: unbooked > 0 },
      transport: { t: tr ? `${tr} 段待订` : '都订好了', warn: tr > 0 },
      nye: { t: nye ? nye.name.replace(/（.*?）|\(.*?\)/g, '').replace(re, '').replace(/倒数/g, '').trim() || nye.name : '待定', warn: false, id: nye && nye.id },
      links: { t: '小红书、攻略链接', warn: false },
      packing: { t: '先选一下你是谁', warn: false }, bills: { t: '先选一下你是谁', warn: false },
    };
    if (me) {
      const p = packingProgress(me); s.packing = { t: `${p.d} / ${p.n} 已带`, warn: p.d < p.n };
      if (window.TripMoney) {
        const b = TripMoney.balances(data.expenses, data.settlements, IDS, rate).bal[me];
        s.bills = b > 0.01 ? { t: `我应收 ${yuan(b)}`, warn: false } : b < -0.01 ? { t: `我应付 ${yuan(-b)}`, warn: true } : { t: '已结清', warn: false };
      }
    }
    return s;
  }
  function packingProgress(id) {
    const cats = (window.Packing && Packing.CATS) || [], doc = data.packing[id] || {}, items = doc.items || {}, custom = doc.custom || [];
    const keys = [...cats.flatMap(c => c.items.map(i => i[0])), ...custom.map(c => c.k)];
    return { n: keys.length, d: keys.filter(k => items[k]).length };
  }
  function quick() {
    const s = status(), H = window.TRIP_HIGHLIGHT, mods = (Trip.trip || {}).modules || {};
    const QUICK = [['flights', '航班', 'plane'], ['hotels', '住宿', 'bed-double'], ['transport', '交通', 'bus'],
      H ? ['nye', H.label || '亮点', H.icon || 'sparkles'] : ['links', '攻略收藏', 'bookmark'],
      ...(mods.packing === false ? [] : [['packing', '行李', 'luggage']]), ...(mods.bills === false ? [] : [['bills', '账单', 'wallet']])];
    return QUICK.map(([k, n, i]) => `<button type="button" class="ov-q" data-ovq="${k}"><i data-lucide="${i}"></i><b>${n}</b><span class="${s[k].warn ? 'warn' : ''}">${esc(s[k].t)}</span></button>`).join('');
  }

  /* ---------- day strip ---------- */
  function strip() {
    const t = now(), today = t >= TRIP_START && t < TRIP_END ? Math.min(NDAYS, Math.floor((t - TRIP_START) / DAY) + 1) : 0;
    return DAYS.filter(d => d.id).map(d => {
      const m = mainOf(d), last = m[m.length - 1], city = last && window.TripRoutes ? (TripRoutes.cityOf(last) || {}).name : '';
      return `<button type="button" class="ov-day${d.id === today ? ' today' : ''}" data-ovday="${d.id}" style="--c:${dayHex(d.id)}"${d.id === today ? ' aria-current="date"' : ''}>
        <span class="top"><i></i><b>D${d.id}</b><span class="num">${vnDate(dayStart(d.id))}</span></span><span class="city">${esc(city || '')}</span><span class="tt">${esc(d.title)}</span></button>`;
    }).join('');
  }

  /* ---------- panels: bottom sheet on phones, right drawer on desktop ---------- */
  let sheet = null;
  function ensureSheet() {
    if (sheet) return sheet;
    sheet = document.createElement('div'); sheet.className = 'gsh-bg'; sheet.hidden = true;
    sheet.innerHTML = `<section class="gsh" role="dialog" aria-modal="true" aria-labelledby="gshTitle"><div class="gsh-h"><span class="grip"></span><h2 id="gshTitle"></h2><button type="button" class="ov-x" data-gshclose aria-label="关闭"><i data-lucide="x"></i></button></div><div class="gsh-b"></div></section>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('[data-gshclose]')) closeSheet(); const d = e.target.closest('[data-ovday]'); if (d) { closeSheet(); go(+d.dataset.ovday); } });
    // swipe down on the header to close (phones)
    const h = sheet.querySelector('.gsh-h'); let y0 = null;
    h.addEventListener('pointerdown', e => { if (e.target.closest('button')) return;   // let the × button get its click
      y0 = e.clientY; h.setPointerCapture(e.pointerId); });
    h.addEventListener('pointermove', e => { if (y0 === null) return; const dy = Math.max(0, e.clientY - y0); sheet.querySelector('.gsh').style.transform = innerWidth < 768 ? `translateY(${dy}px)` : ''; });
    h.addEventListener('pointerup', e => { if (y0 === null) return; const dy = e.clientY - y0; y0 = null; sheet.querySelector('.gsh').style.transform = ''; if (dy > 80 && innerWidth < 768) closeSheet(); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });
    return sheet;
  }
  function openSheet(title, html, after) {
    const s = ensureSheet(); s.querySelector('#gshTitle').textContent = title; s.querySelector('.gsh-b').innerHTML = html;
    s.hidden = false; requestAnimationFrame(() => s.classList.add('open')); if (after) after(s.querySelector('.gsh-b')); icons(s);
    s.querySelector('[data-gshclose]').focus();
  }
  function closeSheet() { if (!sheet) return; sheet.classList.remove('open'); setTimeout(() => { sheet.hidden = true; }, 220); }
  const mapLink = q => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  function panel(k) {
    if (k === 'flights') return openSheet('航班', '<div id="gshFlights"></div>', b => window.renderFlights && renderFlights(b.querySelector('#gshFlights'), { name: id => memberName(id) || id }));
    if (k === 'hotels') return openSheet('住宿', (window.TRIP_HOTELS || []).map(h => { const no = h.task ? !groupDone(h.task) : h.booked === false;   // Vietnam: group-checklist task; imported trips: booked flag
      return `<div class="gsh-item"><span class="pill">${esc(h.when)}</span>${no ? '<span class="tag warn">未订</span>' : '<span class="tag ok">已订</span>'}
        <b>${esc(h.name)}</b>${h.addr ? `<span class="muted">${esc(h.addr)}</span>` : ''}${h.note ? `<span class="sub">${esc(h.note).replace(/\{(m\d)\}/g, (_, id) => nm(id))}</span>` : ''}
        <div class="row"><a class="btn btn-sm" href="${mapLink(h.q || h.name)}" target="_blank" rel="noopener"><i data-lucide="navigation" class="i18"></i>Google Maps</a><button type="button" class="btn btn-sm" data-ovday="${h.day}">看 D${h.day}</button></div></div>`; }).join(''));
    if (k === 'transport') return openSheet('交通', (window.TRIP_TRANSPORT || []).map(x => `<div class="gsh-item"><span class="tag ${groupDone(x.task) ? 'ok">已订' : 'warn">待订'}</span>
        <b><i data-lucide="${x.icon}" class="i18"></i>${esc(x.title)}</b><span class="muted">${esc(x.when)}</span><span class="sub">${esc(x.note)}</span>
        <div class="row"><button type="button" class="btn btn-sm" data-ovday="${x.day}">看 D${x.day} 路线</button><a class="btn btn-sm" href="${L('index.html', 'check')}">去准备清单</a></div></div>`).join('')
        + '<p class="sub">订好以后在工具箱「准备清单 · 集体要办的」里打勾，这里会跟着更新。</p>');
    if (k === 'nye') { const id = status().nye.id, H = window.TRIP_HIGHLIGHT || {}; go(H.day || 1); if (id) setTimeout(() => selectLoc(id, 'card'), 400); return; }
    if (k === 'links') { location.href = L('index.html', 'links'); return; }
    if (k === 'packing') { location.href = L('index.html', 'packing'); return; }
    if (k === 'bills') { location.href = L('index.html', 'bills'); return; }
  }

  /* ---------- public ---------- */
  function html() {
    syncTrip();
    return `<div id="ovNext">${nextCard()}</div><div id="ovWarn">${warnBar()}</div>
      <div class="ov-qwrap"><div class="ov-quick" id="ovQuick">${quick()}</div></div>
      <div class="section-head">行程</div><div class="ov-days" id="ovDays">${strip()}</div>`;
  }
  function refresh() {
    syncTrip();   // update in place (no re-render of the sheet/map)
    const set = (id, h) => { const el = document.getElementById(id); if (el) el.innerHTML = h; };
    set('ovNext', nextCard()); set('ovWarn', warnBar()); set('ovQuick', quick()); set('ovDays', strip());
    const el = document.getElementById('ovNext'); if (el) icons(el.parentNode);
  }
  function mount(root) {
    if (!root || root.dataset.ovBound) return; root.dataset.ovBound = '1';
    root.addEventListener('click', e => {
      const q = e.target.closest('[data-ovq]'); if (q) return panel(q.dataset.ovq);
      const d = e.target.closest('[data-ovday]'); if (d) return go(+d.dataset.ovday);
      const n = e.target.closest('[data-ovnav]'); if (n) { const l = findLoc(n.dataset.ovnav); if (l) openAS(l.name, l.lat, l.lng, l.gmap); return; }
      const w = e.target.closest('[data-ovwarn]'); if (w) { try { localStorage.setItem(warnKey(w.dataset.ovwarn), '1'); } catch (er) {} refresh(); }
    });
  }
  // bring today's card into view by scrolling the strip only (scrollIntoView would also move the panel)
  function afterRender() { const box = document.getElementById('ovDays'), t = box && box.querySelector('.today'); if (!t) return;
    const b = box.getBoundingClientRect(), r = t.getBoundingClientRect(); box.scrollLeft += r.left - b.left - (b.width - r.width) / 2; }
  window.GuideOverview = { html, refresh, mount, afterRender, setData: patch => { Object.assign(data, patch); refresh(); }, _test: { locTime, status, packingProgress, now } };
})();
