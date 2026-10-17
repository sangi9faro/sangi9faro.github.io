// Owner tools shared by the homepage and /t/ pages: a sheet (bottom sheet on phones, dialog on desktop),
// 编辑旅行信息, and deleting a trip. Needs ui.css (.tsheet*), cover.js; Lucide for icons.
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = r => { try { lucide.createIcons({ attrs: { 'stroke-width': 1.75 }, root: r }); } catch (e) {} };
  const COLORS = ['#E8613C', '#0B7A8C', '#C2397A', '#7B5BC9', '#2E8B57', '#3A6FD8'];
  const MODULES = [['guide', '行程攻略'], ['tools', '工具箱'], ['bills', '账单'], ['packing', '行李'], ['vote', '投票']];
  const MAX_MEMBERS = 8;

  /* ---------- sheet ---------- */
  function sheet(title, html, { wide } = {}) {
    const bg = document.createElement('div'); bg.className = 'tsheet-bg';
    bg.innerHTML = `<section class="tsheet${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="tsheet-h"><span class="grip"></span><h2>${esc(title)}</h2><button type="button" class="tsheet-x" aria-label="关闭"><i data-lucide="x"></i></button></header>
      <div class="tsheet-b">${html}</div></section>`;
    document.body.appendChild(bg); document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(() => bg.classList.add('open')); icons(bg);
    const close = () => { bg.classList.remove('open'); document.documentElement.style.overflow = ''; setTimeout(() => bg.remove(), 220); removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') close(); };
    addEventListener('keydown', key);
    bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('.tsheet-x')) close(); });
    return { el: bg.querySelector('.tsheet'), body: bg.querySelector('.tsheet-b'), close };
  }
  function toastMsg(m) { (window.toast || (x => alertBox(x)))(m); }
  function alertBox(m) { let t = document.querySelector('.tsheet-toast'); if (!t) { t = document.createElement('div'); t.className = 'tsheet-toast'; document.body.appendChild(t); }
    t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400); }

  /* ---------- members in use (they can be renamed, not removed) ---------- */
  async function usedMembers(fs, tripId) {
    const used = new Set(), T = `trips/${tripId}/`;
    const [ex, st] = await Promise.all([fs.collection(T + 'expenses').get(), fs.collection(T + 'settlements').get()]);
    ex.docs.forEach(d => { const x = d.data(); used.add(x.payer); (x.split || []).forEach(m => used.add(m)); });
    st.docs.forEach(d => { used.add(d.data().from); used.add(d.data().to); });
    return used;
  }

  /* ---------- 编辑旅行信息 ---------- */
  function edit({ fs, tripId, trip, onSaved }) {
    const t = JSON.parse(JSON.stringify(trip)), members = { ...(t.members || {}) };
    let cover = null, coverPos = t.coverPos || '50% 50%';
    const mods = t.modules || {};
    const s = sheet('编辑旅行信息', `
      <form class="tform" novalidate>
        <label class="tf">名称<input name="title" maxlength="60" value="${esc(t.title)}" required></label>
        <div class="tf-row"><label class="tf">开始<input type="date" name="start" value="${esc(t.start)}" required></label><label class="tf">结束<input type="date" name="end" value="${esc(t.end)}" required></label></div>
        <label class="tf">路线（用 → 或逗号分开）<input name="route" value="${esc((t.route || []).join(' → '))}"></label>
        <label class="tf">简介<textarea name="summary" rows="2" maxlength="200">${esc(t.summary || '')}</textarea></label>
        <div class="tf">主题颜色<div class="sw-row">${COLORS.map(c => `<button type="button" class="sw${c.toLowerCase() === String(t.color || '').toLowerCase() ? ' on' : ''}" data-color="${c}" style="--c:${c}" aria-label="颜色 ${c}"></button>`).join('')}</div></div>
        <div class="tf">封面<div class="cov" id="tfCover" style="${TripCover.css(t, null)}"><span class="cov-hint">${TripCover.hasPhoto(t, null) ? '拖动调整显示位置' : '还没有封面'}</span></div>
          <div class="row"><label class="btn btn-sm"><i data-lucide="image-up" class="i18"></i>换封面<input type="file" accept="image/*" hidden id="tfFile"></label><span class="sub" id="tfCoverInfo"></span></div></div>
        <div class="tf">成员（最多 ${MAX_MEMBERS} 人；有账目的成员只能改名字）<div id="tfMembers" class="tf-members"></div>
          <button type="button" class="btn btn-sm ghost" id="tfAddMember"><i data-lucide="user-plus" class="i18"></i>增加成员</button></div>
        <div class="tf">启用的功能<div class="tg-list">${MODULES.map(([k, n]) => `<label class="tg"><input type="checkbox" name="mod_${k}" ${mods[k] !== false ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div></div>
        <div class="tf">公开范围<div class="seg vis">
          <label><input type="radio" name="visibility" value="members" ${t.visibility !== 'link' ? 'checked' : ''}><span>只有成员能看</span></label>
          <label><input type="radio" name="visibility" value="link" ${t.visibility === 'link' ? 'checked' : ''}><span>有链接就能看</span></label></div></div>
        <p class="sub tf-err" role="alert"></p>
        <div class="tsheet-act"><button type="button" class="btn ghost" data-cancel>取消</button><button type="submit" class="btn btn-primary"><i data-lucide="save" class="i18"></i>保存</button></div>
      </form>`);
    const f = s.body.querySelector('form'), err = m => { f.querySelector('.tf-err').textContent = m || ''; };
    let used = new Set(); usedMembers(fs, tripId).then(u => { used = u; drawMembers(); }).catch(() => {});
    function drawMembers() {
      const ids = Object.keys(members).sort();
      s.body.querySelector('#tfMembers').innerHTML = ids.map(id => `<div class="tf-m"><span class="av sm" style="--p:var(--${id},var(--ink-2))">${esc(id.slice(1))}</span>
        <input data-mid="${id}" maxlength="20" value="${esc(members[id])}" aria-label="成员 ${id} 的名字">
        ${used.has(id) ? '<span class="sub">有账目</span>' : `<button type="button" class="tsheet-x" data-rm="${id}" aria-label="删除成员"><i data-lucide="user-minus"></i></button>`}</div>`).join('');
      s.body.querySelector('#tfAddMember').hidden = ids.length >= MAX_MEMBERS; icons(s.body);
    }
    drawMembers();
    if (TripCover.hasPhoto(t, null)) TripCover.draggable(s.body.querySelector('#tfCover'), coverPos, p => { coverPos = p; });
    TripCover.load(fs, tripId).then(d => { if (!d || cover) return; const el = s.body.querySelector('#tfCover'); el.setAttribute('style', TripCover.css({ ...t, coverPos }, d)); el.querySelector('.cov-hint').textContent = '拖动调整显示位置'; TripCover.draggable(el, coverPos, p => { coverPos = p; }); });
    s.body.addEventListener('click', e => {
      const c = e.target.closest('[data-color]'); if (c) { t.color = c.dataset.color; s.body.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', b === c)); }
      const rm = e.target.closest('[data-rm]'); if (rm) { delete members[rm.dataset.rm]; drawMembers(); }
      if (e.target.closest('#tfAddMember')) { const free = Array.from({ length: MAX_MEMBERS }, (_, i) => 'm' + (i + 1)).find(id => !members[id]); if (free) { members[free] = '成员' + 'ABCDEFGH'[+free.slice(1) - 1]; drawMembers(); s.body.querySelector(`[data-mid="${free}"]`).select(); } }
      if (e.target.closest('[data-cancel]')) s.close();
    });
    s.body.addEventListener('input', e => { if (e.target.dataset.mid) members[e.target.dataset.mid] = e.target.value; });
    s.body.querySelector('#tfFile').addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      const info = s.body.querySelector('#tfCoverInfo'); info.textContent = '压缩中…';
      try { cover = await TripCover.compress(file); coverPos = '50% 50%';
        const el = s.body.querySelector('#tfCover'); el.setAttribute('style', TripCover.css({ ...t, coverPos }, cover.data)); el.querySelector('.cov-hint').textContent = '拖动调整显示位置';
        TripCover.draggable(el, coverPos, p => { coverPos = p; });
        info.textContent = `${cover.w}×${cover.h} · ${Math.round(cover.size / 1024)} KB · ${cover.type === 'image/webp' ? 'WebP' : 'JPEG'}`;
      } catch (er) { info.textContent = er.message; cover = null; }
    });
    f.addEventListener('submit', async e => {
      e.preventDefault(); err('');
      const v = n => (f.elements[n].value || '').trim();
      const title = v('title'), start = v('start'), end = v('end');
      if (!title) return err('先填旅行名称');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return err('日期不对：结束不能早于开始');
      const names = Object.fromEntries(Object.entries(members).map(([k, n]) => [k, String(n).trim().slice(0, 20) || k]));
      if (!Object.keys(names).length) return err('至少要有一个成员');
      const patch = { title, start, end, route: v('route').split(/\s*(?:→|->|,|，|、)\s*/).filter(Boolean).slice(0, 20), summary: v('summary').slice(0, 200),
        color: t.color || '#0B7A8C', coverPos, members: names, visibility: f.elements.visibility.value,
        modules: Object.fromEntries(MODULES.map(([k]) => [k, f.elements['mod_' + k].checked])), updatedAt: Date.now() };
      const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      try {
        if (cover) await TripCover.save(fs, tripId, cover);
        await fs.doc('trips/' + tripId).update(patch);
        toastMsg('已保存'); s.close(); onSaved && onSaved({ ...trip, ...patch }, cover);
      } catch (er) { err('保存失败：' + (er.code || er.message)); btn.disabled = false; }
    });
    return s;
  }

  /* ---------- delete (type the trip's name to confirm) ---------- */
  const SUBS = ['members', 'cover', 'info', 'days', 'expenses', 'settlements', 'checklist', 'packing', 'links', 'polls', 'votes', 'quiz', 'people', 'notes'];
  function remove({ fs, tripId, trip, onDeleted }) {
    const s = sheet('删除这次旅行', `<form class="tform">
      <p class="warnbox">删除后行程、账单、清单、行李、收藏和投票都会一起删掉，不能恢复。</p>
      <label class="tf">输入旅行名称「${esc(trip.title)}」确认<input name="confirm" autocomplete="off"></label>
      <p class="sub tf-err" role="alert"></p>
      <div class="tsheet-act"><button type="button" class="btn ghost" data-cancel>取消</button><button type="submit" class="btn danger" disabled><i data-lucide="trash-2" class="i18"></i>删除</button></div></form>`);
    const f = s.body.querySelector('form'), btn = f.querySelector('[type=submit]');
    f.elements.confirm.addEventListener('input', () => { btn.disabled = f.elements.confirm.value.trim() !== trip.title; });
    s.body.querySelector('[data-cancel]').onclick = () => s.close();
    f.addEventListener('submit', async e => {
      e.preventDefault(); if (f.elements.confirm.value.trim() !== trip.title) return; btn.disabled = true;
      try {
        for (const c of SUBS) {
          const docs = (await fs.collection(`trips/${tripId}/${c}`).get()).docs;
          if (c === 'polls') for (const p of docs) for (const b of (await p.ref.collection('ballots').get()).docs) await b.ref.delete();
          for (let i = 0; i < docs.length; i += 400) { const b = fs.batch(); docs.slice(i, i + 400).forEach(d => b.delete(d.ref)); await b.commit(); }
        }
        await fs.doc('trips/' + tripId).delete();
        toastMsg('已删除'); s.close(); onDeleted && onDeleted();
      } catch (er) { f.querySelector('.tf-err').textContent = '删除失败：' + (er.code || er.message); btn.disabled = false; }
    });
  }

  window.TripEditor = { sheet, edit, remove, COLORS, MODULES, toast: alertBox };
})();
