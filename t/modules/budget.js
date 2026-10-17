// 预算计划表 on the homepage (owner only): budgets/{id} = { title, limit, trips: { tripId: memberId }, items: [...] }.
// Rows come from two places: my share of every expense in those trips' bills (read-only, tagged 账单),
// and items added here (flights, estimates) with a status 已付 / 待付 / 估算. Needs editor.js (sheet, toast) and money.js.
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = r => { try { lucide.createIcons({ attrs: { 'stroke-width': 1.75 }, root: r }); } catch (e) {} };
  const yuan = n => '¥' + Math.round(n).toLocaleString('en-US');
  // bills categories (bills.js AA_CATS) plus 机票, which only the budget uses
  const CATS = [['flight', '机票', 'plane'], ['stay', '住宿', 'bed-double'], ['transport', '交通', 'car'], ['food', '餐饮', 'utensils'],
    ['fun', '门票玩乐', 'ticket'], ['shop', '购物', 'shopping-bag'], ['other', '其他', 'ellipsis']];
  const ST = { paid: '已付', due: '待付', est: '估算' };
  const newId = () => Math.random().toString(36).slice(2, 10);

  // my share (CNY) of each expense in the budget's trips
  async function billRows(fs, b) {
    const rows = [];
    for (const [tripId, me] of Object.entries(b.trips || {})) {
      let snap; try { snap = await fs.collection(`trips/${tripId}/expenses`).get(); } catch (e) { continue; }
      for (const d of snap.docs) {
        const x = d.data(), r = c => x.currency === c ? (x.rate || 1) : 1;   // locked cny is used whenever present
        const share = (TripMoney.sharesOf(x, x.split || [], r) || {})[me];
        if (share > 0) rows.push({ id: 'bill-' + d.id, label: x.title, amount: share, cat: x.cat || 'other', status: 'bill', trip: tripId, day: x.day || '' });
      }
    }
    return rows;
  }

  function mount(el, { fs }) {
    let budgets = [], open = {};
    const draw = async () => {
      if (!budgets.length) { el.hidden = true; return; }
      el.hidden = false;
      const parts = await Promise.all(budgets.map(async b => ({ b, bills: await billRows(fs, b) })));
      el.querySelector('.bd-list').innerHTML = parts.map(({ b, bills }) => card(b, bills)).join('');
      icons(el);
    };
    function card(b, bills) {
      const rows = [...bills, ...(b.items || [])];
      const sum = f => rows.filter(f).reduce((a, x) => a + (+x.amount || 0), 0);
      const paid = sum(x => x.status === 'paid' || x.status === 'bill'), due = sum(x => x.status === 'due'), est = sum(x => x.status === 'est');
      const total = paid + due + est, limit = +b.limit || 0, left = limit - total, pct = v => limit ? Math.min(100, v / Math.max(limit, total) * 100) : 0;
      const todo = (b.items || []).filter(x => !(+x.amount > 0)).length;
      const cats = CATS.map(([k, n, ic]) => ({ k, n, ic, rows: rows.filter(x => (CATS.some(c => c[0] === x.cat) ? x.cat : 'other') === k).sort((a, z) => z.amount - a.amount) }))
        .filter(c => c.rows.length);
      return `<article class="card bd" data-bd="${esc(b.id)}">
        <div class="bd-top"><div><div class="sub">${esc(b.title)}</div>
          <div class="bd-sum"><b class="num">${yuan(total)}</b><span class="sub">/ 预算 <button type="button" class="linkbtn num" data-bd-limit="${esc(b.id)}">${yuan(limit)}</button></span></div></div>
          <div class="bd-state ${left < 0 ? 'over' : 'ok'}">${left < 0 ? `超出 <b class="num">${yuan(-left)}</b>` : `还剩 <b class="num">${yuan(left)}</b>`}</div></div>
        <div class="bd-bar" role="img" aria-label="已付 ${yuan(paid)}，待付 ${yuan(due)}，估算 ${yuan(est)}，预算 ${yuan(limit)}">
          <i class="paid" style="width:${pct(paid)}%"></i><i class="due" style="width:${pct(due)}%"></i><i class="est" style="width:${pct(est)}%"></i>
          ${limit && total > limit ? `<span class="bd-line" style="left:${limit / total * 100}%"></span>` : ''}</div>
        <div class="bd-legend"><span><i class="paid"></i>已付 <b class="num">${yuan(paid)}</b></span><span><i class="due"></i>待付 <b class="num">${yuan(due)}</b></span><span><i class="est"></i>估算 <b class="num">${yuan(est)}</b></span></div>
        ${todo ? `<p class="bd-todo"><i data-lucide="circle-help" class="i18"></i>${todo} 项还没填金额，没算进去</p>` : ''}
        <div class="bd-cats">${cats.map(c => { const sub = c.rows.reduce((a, x) => a + (+x.amount || 0), 0), key = b.id + c.k;
          return `<details class="bd-cat" data-key="${esc(key)}" ${open[key] ? 'open' : ''}><summary><i data-lucide="${c.ic}" class="i18"></i><span>${c.n}</span><small>${c.rows.length} 项</small><b class="num">${yuan(sub)}</b></summary>
            ${c.rows.map(x => row(b, x)).join('')}</details>`; }).join('')}</div>
        <div class="bd-act"><button type="button" class="btn btn-sm" data-bd-add="${esc(b.id)}"><i data-lucide="plus" class="i18"></i>加一项</button>
          <span class="sub">账单里你那份会自动算进来（标「账单」），不用重复加。</span></div></article>`;
    }
    function row(b, x) {
      const tag = x.status === 'bill' ? '<span class="bd-st bill">账单</span>' : `<span class="bd-st ${x.status}">${ST[x.status] || '估算'}</span>`;
      const amt = +x.amount > 0 ? yuan(x.amount) : '<span class="sub">待填</span>';
      const inner = `<span class="bd-l">${esc(x.label)}${x.note ? `<small>${esc(x.note)}</small>` : ''}</span>${tag}<b class="num">${amt}</b>`;
      return x.status === 'bill' ? `<a class="bd-row" href="/t/?id=${encodeURIComponent(x.trip)}#bills">${inner}</a>`
        : `<button type="button" class="bd-row" data-bd-edit="${esc(b.id)}" data-item="${esc(x.id)}">${inner}</button>`;
    }

    const save = b => fs.doc('budgets/' + b.id).update({ items: b.items, limit: b.limit, at: Date.now() });
    function editItem(b, x) {
      const isNew = !x; x = x || { id: newId(), label: '', amount: 0, cat: 'food', status: 'est' };
      const s = TripEditor.sheet(isNew ? '加一项预算' : '改这一项', `<form class="tform" novalidate>
        <label class="tf">项目<input name="label" maxlength="40" value="${esc(x.label)}" placeholder="例如：越南吃饭 6 天" required></label>
        <div class="tf-row"><label class="tf">金额（人民币）<input name="amount" type="number" inputmode="decimal" min="0" step="1" value="${+x.amount > 0 ? Math.round(x.amount * 100) / 100 : ''}" placeholder="还不知道就空着"></label>
          <label class="tf">分类<select name="cat">${CATS.map(([k, n]) => `<option value="${k}" ${k === x.cat ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
        <div class="tf">状态<div class="seg vis">${Object.entries(ST).map(([k, n]) => `<label><input type="radio" name="status" value="${k}" ${k === x.status ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div></div>
        <label class="tf">备注<input name="note" maxlength="60" value="${esc(x.note || '')}"></label>
        <p class="sub tf-err" role="alert"></p>
        <div class="tsheet-act">${isNew ? '<span></span>' : '<button type="button" class="btn ghost danger-text" data-del>删除</button>'}<button type="submit" class="btn btn-primary"><i data-lucide="save" class="i18"></i>保存</button></div></form>`);
      const f = s.body.querySelector('form');
      let armed = false;
      const del = f.querySelector('[data-del]');
      if (del) del.onclick = async () => {
        if (!armed) { armed = true; del.textContent = '再点一次确认删除'; setTimeout(() => { armed = false; del.textContent = '删除'; }, 4000); return; }
        b.items = b.items.filter(y => y.id !== x.id); try { await save(b); s.close(); draw(); } catch (e) { f.querySelector('.tf-err').textContent = '没删成：' + (e.code || e.message); }
      };
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const label = f.elements.label.value.trim(); if (!label) { f.querySelector('.tf-err').textContent = '先写是什么'; return; }
        const item = { id: x.id, label, amount: Math.max(0, parseFloat(f.elements.amount.value) || 0), cat: f.elements.cat.value, status: f.elements.status.value };
        const note = f.elements.note.value.trim(); if (note) item.note = note;
        b.items = isNew ? [...(b.items || []), item] : b.items.map(y => y.id === x.id ? item : y);
        try { await save(b); s.close(); draw(); } catch (er) { f.querySelector('.tf-err').textContent = '没存上：' + (er.code || er.message); }
      });
    }
    function editLimit(b) {
      const s = TripEditor.sheet('预算上限', `<form class="tform" novalidate><label class="tf">这次最多花多少（人民币）<input name="limit" type="number" inputmode="decimal" min="0" step="100" value="${+b.limit || ''}"></label>
        <div class="tsheet-act"><span></span><button type="submit" class="btn btn-primary">保存</button></div></form>`);
      s.body.querySelector('form').addEventListener('submit', async e => { e.preventDefault(); b.limit = Math.max(0, parseFloat(e.target.elements.limit.value) || 0);
        try { await save(b); s.close(); draw(); } catch (er) { TripEditor.toast('没存上：' + (er.code || er.message)); } });
    }
    el.addEventListener('click', e => {
      const t = e.target.closest('[data-bd-edit],[data-bd-add],[data-bd-limit]'); if (!t) return;
      const b = budgets.find(y => y.id === (t.dataset.bdEdit || t.dataset.bdAdd || t.dataset.bdLimit)); if (!b) return;
      if (t.dataset.bdLimit) editLimit(b);
      else editItem(b, t.dataset.bdAdd ? null : b.items.find(y => y.id === t.dataset.item));
    });
    el.addEventListener('toggle', e => { const d = e.target.closest('.bd-cat'); if (d) open[d.dataset.key] = d.open; }, true);
    const load = () => fs.collection('budgets').get().then(s => { budgets = s.docs.map(d => ({ id: d.id, items: [], ...d.data() })); draw(); }).catch(() => { el.hidden = true; });
    load();
    return { refresh: load };
  }
  window.TripBudget = { mount, CATS };
})();
