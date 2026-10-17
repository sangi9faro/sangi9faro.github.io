// Flight cards + timeline (one implementation for guide.html and index.html).
// Usage: renderFlights(el, { name: id => "成员A" })
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NA = '<span class="na">—</span>';
  // local wall-clock parts straight from the ISO string (the offset is the airport's own)
  const loc = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || ''); return m ? { y: +m[1], mo: +m[2], d: +m[3], hm: `${m[4]}:${m[5]}` } : null; };
  const t = iso => (iso ? Date.parse(iso) : NaN);
  const dur = f => { const ms = t(f.arr) - t(f.dep); if (!(ms > 0)) return null; const m = Math.round(ms / 60000); return `${Math.floor(m / 60)} 小时 ${m % 60} 分`; };
  const plusDays = f => { const a = loc(f.dep), b = loc(f.arr); if (!a || !b) return 0; return Math.round((Date.UTC(b.y, b.mo - 1, b.d) - Date.UTC(a.y, a.mo - 1, a.d)) / 864e5); };
  const key = f => (f.dir === 'in' ? t(f.arr) : t(f.dep)) || t(f.approx) || Infinity;
  const ST = { ticketed: '已出票', pending: '待出票', tbd: '待补充' };
  const md = iso => { const l = loc(iso); return l ? `${l.mo}/${l.d}` : ''; };
  const ap = e => e ? `${esc(e.code || '—')}${e.term ? ' · ' + esc(e.term) : ''}` : NA;

  const ini = (id, name) => window.tripInitial ? tripInitial(id, Object.fromEntries(['m1', 'm2', 'm3', 'm4'].map(m => [m, name(m)]))) : String(name(id)).slice(0, 1);
  function card(f, name, idx) {
    const d = dur(f), p = plusDays(f), late = f.dir === 'out' && f.dep ? new Date(t(f.dep) - 2 * 3600e3) : null;
    const lateHM = late ? (() => { const off = /([+-]\d{2}):(\d{2})$/.exec(f.dep); const mins = off ? (+off[1]) * 60 + Math.sign(+off[1]) * (+off[2]) : 0;
      const x = new Date(late.getTime() + mins * 60000); return `${String(x.getUTCHours()).padStart(2, '0')}:${String(x.getUTCMinutes()).padStart(2, '0')}`; })() : null;
    const depT = loc(f.dep), arrT = loc(f.arr);
    // no times at all: one compact dashed row (avatar · name · 航班还没定 · 待补充)
    if (!f.dep && !f.arr) return `<article class="fl tbd" id="fl-${f.dir}-${f.who}" style="--p:var(--${f.who})" data-idx="${idx}">
      <span class="fl-who"><span class="av sm" style="--p:var(--${f.who})">${esc(ini(f.who, name))}</span><b>${esc(name(f.who))}</b></span>
      <span class="fl-tbd">航班还没定${f.approxLabel ? ' · ' + esc(f.approxLabel) : ''}</span><span class="fl-st ${f.status}">${ST[f.status] || '待补充'}</span></article>`;
    return `<article class="fl" id="fl-${f.dir}-${f.who}" style="--p:var(--${f.who})" data-idx="${idx}">
      <div class="fl-top"><span class="fl-who"><span class="av sm" style="--p:var(--${f.who})">${esc(ini(f.who, name))}</span><b>${esc(name(f.who))}</b></span>
        <span class="fl-st ${f.status}">${ST[f.status] || '待补充'}</span></div>
      <div class="fl-in">
        <div class="fl-end dep"><div class="tm">${depT ? depT.hm : NA}</div><div class="ap">${ap(f.from)}</div><div class="ct">${esc(f.from ? f.from.city : '')}${depT ? ' · ' + md(f.dep) : (f.approxLabel && f.dir === 'out' ? ' · ' + esc(f.approxLabel) : '')}</div></div>
        <div class="fl-mid"><span class="dur">${d || '—'}</span><span class="ln"><i data-lucide="plane" class="i18"></i></span><span>${f.airline ? esc(f.airline) : '—'} ${f.no ? esc(f.no) : ''}</span></div>
        <div class="fl-end arr"><div class="tm">${arrT ? arrT.hm : NA}${p > 0 ? `<sup>+${p}</sup>` : ''}</div><div class="ap">${ap(f.to)}</div><div class="ct">${esc(f.to ? f.to.city : '')}${arrT ? ' · ' + md(f.arr) : (f.approxLabel && f.dir === 'in' ? ' · ' + esc(f.approxLabel) : '')}</div></div>
      </div>
      ${f.dir === 'out' && lateHM ? `<div class="fl-late"><i data-lucide="clock" class="i18"></i><span>最晚 <b>${lateHM}</b> 到机场（国际航班提前 2 小时）</span></div>` : ''}
    </article>`;
  }
  function axis(list, name) {
    const ts = list.map(key).filter(isFinite); if (!ts.length) return '';
    const lo = Math.min(...ts), hi = Math.max(...ts), span = Math.max(hi - lo, 1);
    // proportional to time, but keep a minimum gap so labels of close arrivals don't collide
    const shown = list.filter(f => isFinite(key(f))), pos = shown.map(f => 4 + 92 * (key(f) - lo) / span), GAP = Math.min(24, 92 / Math.max(shown.length - 1, 1));
    for (let i = 1; i < pos.length; i++) pos[i] = Math.max(pos[i], pos[i - 1] + GAP);
    for (let i = pos.length - 1; i >= 0; i--) pos[i] = Math.min(pos[i], i === pos.length - 1 ? 96 : pos[i + 1] - GAP);
    return `<div class="fl-axis" role="list" aria-label="时间轴">${shown.map((f, i) => {
      const pct = pos[i], iso = f.dir === 'in' ? (f.arr || f.approx) : (f.dep || f.approx), l = loc(iso);
      return `<button class="fl-dot${(f.dir === 'in' ? f.arr : f.dep) ? '' : ' approx'}" role="listitem" style="left:${pct}%;--p:var(--${f.who})" data-go="fl-${f.dir}-${f.who}" aria-label="${esc(name(f.who))} ${l ? l.mo + '/' + l.d + ' ' + l.hm : ''}">
        <span class="t">${(f.dir === 'in' ? f.arr : f.dep) && l ? `${l.mo}/${l.d} ${l.hm}` : esc(f.approxLabel || '?')}</span><span class="n">${esc(name(f.who))}</span></button>`; }).join('')}</div>`;
  }
  window.renderFlights = function (el, opts) {
    const name = (opts && opts.name) || (id => id);
    const all = window.TRIP_FLIGHTS || [];
    const col = dir => { const list = all.filter(f => f.dir === dir).sort((a, b) => key(a) - key(b));
      return `<section class="fl-col" data-dir="${dir}"${dir === 'out' && el.dataset.dir !== 'out' ? ' hidden' : ''}${dir === 'in' && el.dataset.dir === 'out' ? ' hidden' : ''}>
        <div class="fl-head"><h3><i data-lucide="${dir === 'in' ? 'plane-landing' : 'plane-takeoff'}" class="i18"></i>${dir === 'in' ? '去程' : '回程'} · ${new Set(list.map(f => f.who)).size} 人<small>${dir === 'in' ? '按到达时间' : '按起飞时间'}</small></h3>
        ${axis(list, name)}</div><div class="fl-list">${list.map((f, i) => card(f, name, i)).join('')}</div></section>`; };
    const cur = el.dataset.dir || 'in';
    el.innerHTML = `<div class="fl-wrap"><div class="seg fl-switch chips" role="tablist" aria-label="去程或回程">
        <button class="chip${cur === 'in' ? ' on' : ''}" role="tab" aria-selected="${cur === 'in'}" data-dir="in">去程</button>
        <button class="chip${cur === 'out' ? ' on' : ''}" role="tab" aria-selected="${cur === 'out'}" data-dir="out">回程</button></div>
      <div class="fl-cols">${col('in')}${col('out')}</div></div>`;
    if (!el.dataset.bound) {
      el.dataset.bound = '1';
      el.addEventListener('click', e => {
        const s = e.target.closest('[data-dir]'); if (s && s.closest('.fl-switch')) { el.dataset.dir = s.dataset.dir; window.renderFlights(el, el._opts); return; }
        const g = e.target.closest('[data-go]'); if (g) { const c = document.getElementById(g.dataset.go); if (c) { c.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
          c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 1400); } }
      });
    }
    el._opts = opts;
    try { if (window.lucide) lucide.createIcons({ attrs: { 'stroke-width': 1.75 } }); } catch (e) {}
  };
  // expose helpers for tests
  window.__flightHelpers = { dur, plusDays };
})();
