// AA 账单 for index.html: expenses (equal / shares / amounts, locked CNY at entry), repayments
// (settlements), settled-on-the-spot entries, stats, filters and a copyable settlement text.
// Uses globals from index.html: $, esc, IDS, nm, settings, rate, fmt, toast, ready, db, uid, me, SYM, lucideIcons.
const AA_CATS = [['food', '餐饮', 'utensils'], ['transport', '交通', 'car'], ['stay', '住宿', 'bed-double'], ['fun', '门票玩乐', 'ticket'], ['shop', '购物', 'shopping-bag'], ['other', '其他', 'ellipsis']];
const AA_CAT = Object.fromEntries(AA_CATS.map(([k, n, i]) => [k, { n, i }]));
const METHODS = { wechat: '微信', alipay: '支付宝', cash: '现金', bank: '银行转账', other: '其他' };
// the trip's days (YYYY-MM-DD), from trip.start … trip.end
const TRIP_DAYS = [];
function setTripDays(start, end) { TRIP_DAYS.splice(0); if (!start || !end) return; for (let t = Date.parse(start + 'T12:00:00Z'); t <= Date.parse(end + 'T12:00:00Z'); t += 864e5) TRIP_DAYS.push(new Date(t).toISOString().slice(0, 10)); }
const EPS = 0.01;   // ¥0.01: below this a balance counts as settled

let expenses = [], settlements = [];
let aaFilter = { cat: '', who: '', q: '' };
let split = new Set();                    // participants (all modes); filled in resetForm (IDS is defined after this file loads)
let fmode = 'equal', fvals = {}, fcat = 'food', editId = null, armedKey = '', armedTimer = 0;

/* ---------- money ---------- */
const round2 = n => Math.round(n * 100) / 100;
const cnyOf = x => TripMoney.cnyOf(x, rate);   // money math lives in money.js (shared with the guide)
const yuan = n => '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n, c) => (SYM[c] || '') + fmt(n, c);
const dayLabel = d => { const [, m, dd] = d.split('-'); return `${+m}/${+dd}`; };
const WEEK = '日一二三四五六';
const weekday = d => '周' + WEEK[new Date(d + 'T12:00:00Z').getUTCDay()];
const avOf = id => window.tripInitial ? tripInitial(id, settings.members || {}) : nm(id).slice(0, 1);
const avBtn = (id, attr, on, extra = '') => `<button type="button" class="aa-av${on ? ' on' : ''}" ${attr}="${id}" aria-pressed="${on}"${extra}><span class="av sm" style="--p:var(--${id})">${esc(avOf(id))}</span><span>${esc(nm(id))}</span></button>`;
const wideAA = () => matchMedia('(min-width:1200px)').matches;
// trip day of an expense: its own `day`, else the Vietnam date it was recorded on; before the trip = 'pre'
function dayOf(x) {
  const d = x.day || new Date((x.at || 0) + Trip.tz() * 3600e3).toISOString().slice(0, 10), last = TRIP_DAYS[TRIP_DAYS.length - 1];
  return !TRIP_DAYS.length || d < TRIP_DAYS[0] ? 'pre' : d > last ? last : d;
}
const sharesOf = x => TripMoney.sharesOf(x, IDS, rate);
// balance = paid − owed + repaid out − repaid in; settled entries count for totals only
function settle() {
  const { total, bal, paid, share, spend } = TripMoney.balances(expenses, settlements, IDS, rate);
  const cred = IDS.filter(id => bal[id] > EPS).map(id => [id, bal[id]]).sort((a, b) => b[1] - a[1]);
  const debt = IDS.filter(id => bal[id] < -EPS).map(id => [id, -bal[id]]).sort((a, b) => b[1] - a[1]);
  const xfers = []; let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const m = Math.min(debt[i][1], cred[j][1]); if (m > EPS) xfers.push([debt[i][0], cred[j][0], m]);
    debt[i][1] -= m; cred[j][1] -= m; if (debt[i][1] < EPS) i++; if (cred[j][1] < EPS) j++;
  }
  const clear = IDS.every(id => Math.abs(bal[id]) < EPS);
  return { total, paid, share, bal, xfers, spend, clear };
}

/* ---------- top: 我的账 + 建议转账 + 余额 ---------- */
const repayBtn = (a, b, m, label = '标记已还') => `<button class="btn ghost small" data-repay="${a}|${b}|${round2(m)}"><i data-lucide="check-check" class="i18"></i>${label}</button>`;
function renderMe(s) {
  const el = $('#aaMe');
  if (!me) { el.innerHTML = `<h2><i data-lucide="user-round"></i>我的账</h2><p class="sub">先选一下你是谁，这里会告诉你要给谁钱。</p>
    <button type="button" class="btn ghost small" id="aaPickMe"><i data-lucide="user-round" class="i18"></i>点这里选「我是谁」</button>`; return; }
  const out = s.xfers.filter(x => x[0] === me), inc = s.xfers.filter(x => x[1] === me);
  let h = `<h2><i data-lucide="user-round"></i>我的账 · ${esc(nm(me))}</h2>`;
  if (out.length) h += out.map(([, b, m]) => `<div class="aa-me owe"><span>你还要给 <b>${esc(nm(b))}</b> <b class="num">${yuan(m)}</b></span>${repayBtn(me, b, m)}</div>`).join('');
  else if (inc.length) h += `<div class="aa-me get"><span><b>${inc.map(x => esc(nm(x[0]))).join('、')}</b> 还要给你 <b class="num">${yuan(inc.reduce((a, x) => a + x[2], 0))}</b></span></div>`;
  else h += `<div class="aa-me ok"><i data-lucide="circle-check"></i><span>你已经结清了</span></div>`;
  h += `<p class="sub">我的花费（我应摊的，含已结清的账）：<b class="num">${yuan(s.spend[me])}</b></p>`;
  el.innerHTML = h;
}
function renderOverview(s) {
  const mine = me ? s.bal[me] : null;
  const meCell = !me ? `<div class="ov"><span class="k">我</span><b class="v">—</b><button type="button" class="linkbtn" id="aaPickMe2">选一下我是谁</button></div>`
    : `<div class="ov"><span class="k">${mine > EPS ? '我应收' : mine < -EPS ? '我应付' : '我'}</span><b class="v ${mine > EPS ? 'pos' : mine < -EPS ? 'neg' : ''}">${Math.abs(mine) < EPS ? '已结清' : yuan(Math.abs(mine))}</b></div>`;
  $('#aaOverview').innerHTML = `<div class="ovs">
      <div class="ov"><span class="k">总花费</span><b class="v">${yuan(s.total)}</b><span class="sub">${expenses.length} 笔</span></div>
      <div class="ov"><span class="k">人均</span><b class="v">${yuan(s.total / IDS.length)}</b></div>${meCell}
      <div class="ov"><span class="k">待转账</span><b class="v">${s.xfers.length} 笔</b></div></div>
    <div class="ovm">${IDS.map(id => `<div class="ovp${id === me ? ' me' : ''}"><span class="av sm" style="--p:var(--${id})">${esc(avOf(id))}</span><span class="n">${esc(nm(id))}</span><b class="${s.bal[id] > EPS ? 'pos' : s.bal[id] < -EPS ? 'neg' : ''}">${s.bal[id] >= 0 ? '+' : '−'}${yuan(Math.abs(s.bal[id]))}</b></div>`).join('')}</div>`;
}
function renderSettle(s) {
  const nExp = expenses.length, nSettled = expenses.filter(x => x.settled).length;
  $('#aaTotal').innerHTML = nExp ? `共 ${nExp} 笔${nSettled ? `（${nSettled} 笔当场已结清）` : ''}，合计 <b class="num">${yuan(s.total)}</b>` : '记了账以后，这里会算出谁该转给谁。';
  $('#transfers').innerHTML = s.clear && (nExp || settlements.length)
    ? `<div class="aa-clear"><i data-lucide="circle-check-big"></i>已经全部结清</div>`
    : s.xfers.length ? s.xfers.map(([a, b, m]) => `<div class="xfer"><span>${esc(nm(a))} → ${esc(nm(b))}：<b class="num">${yuan(m)}</b></span>${repayBtn(a, b, m)}</div>`).join('')
    : `<div class="aa-none"><i data-lucide="circle-check"></i>目前不需要转账</div>`;
  $('#aaCopy').disabled = !nExp;
  $('#balances').innerHTML = `<span class="muted">成员</span><span class="muted r">已付 / 应摊</span><span class="muted r">余额</span>` +
    IDS.map(id => `<span>${esc(nm(id))}${id === me ? '（我）' : ''}</span><span class="r">${yuan(s.paid[id])} / ${yuan(s.share[id])}</span><span class="${s.bal[id] >= -EPS ? 'pos' : 'neg'}">${s.bal[id] >= 0 ? '+' : '−'}${yuan(Math.abs(s.bal[id]))}</span>`).join('');
}

/* ---------- stats ---------- */
function renderStats(s) {
  const byCat = Object.fromEntries(AA_CATS.map(([k]) => [k, 0])), byDay = Object.fromEntries(['pre', ...TRIP_DAYS].map(d => [d, 0]));
  for (const x of expenses) { const c = cnyOf(x); byCat[AA_CAT[x.cat] ? x.cat : 'other'] += c; byDay[dayOf(x)] += c; }
  if (!expenses.length) { $('#aaStats').innerHTML = `<p class="empty">还没有记账。</p>`; return; }
  const maxD = Math.max(...Object.values(byDay), 1);
  $('#aaStats').innerHTML = `
    <div class="aa-bars">${AA_CATS.filter(([k]) => byCat[k] > 0).sort((a, b) => byCat[b[0]] - byCat[a[0]]).map(([k, n, i]) => `
      <div class="aa-bar"><span class="l"><i data-lucide="${i}" class="i18"></i>${n}</span><span class="track"><b style="width:${(byCat[k] / s.total * 100).toFixed(1)}%"></b></span>
      <span class="v num">${yuan(byCat[k])} · ${Math.round(byCat[k] / s.total * 100)}%</span></div>`).join('')}</div>
    <div class="aa-days" role="img" aria-label="按天花费">${Object.entries(byDay).map(([d, v]) => `
      <div class="aa-day" title="${d === 'pre' ? '行前' : dayLabel(d)}：${yuan(v)}"><span class="v num">${v ? Math.round(v) : ''}</span><span class="col"><b style="height:${(v / maxD * 100).toFixed(1)}%"></b></span><span class="d">${d === 'pre' ? '行前' : dayLabel(d)}</span></div>`).join('')}</div>
    <p class="sub">${me ? `我的花费：<b class="num">${yuan(s.spend[me])}</b>` : '选了「我是谁」后，这里显示你自己的花费。'}</p>`;
}

/* ---------- ledger ---------- */
function splitText(x) {
  const ids = (x.split || []).filter(id => IDS.includes(id));
  if (x.mode === 'shares') return '按份数 ' + ids.map(id => `${esc(nm(id))} ${+(x.shares || {})[id] || 0}`).join(' / ');
  if (x.mode === 'amounts') return '按金额 ' + ids.map(id => `${esc(nm(id))} ${money(+(x.shares || {})[id] || 0, x.currency)}`).join(' / ');
  return ids.length === IDS.length ? '全员平分' : ids.map(nm).map(esc).join('、') + ' 平分';
}
// the pending “确认删除？” state is kept by key so a live update from another phone doesn't reset it
const delBtn = (kind, id) => { const on = armedKey === kind + ':' + id; return `<button class="del${on ? ' armed' : ''}" data-${kind}="${esc(id)}">${on ? '确认删除？' : '删除'}</button>`; };
function rowExpense(x) {
  const mine = Trip.mine(x), c = cnyOf(x), cat = AA_CAT[x.cat] || AA_CAT.other;
  const conv = x.currency === 'CNY' ? (x.cny > 0 ? '' : '') : x.cny > 0
    ? `≈ ${yuan(c)}（按 1¥ = ${fmt(x.rate || x.amount / x.cny, x.currency)}${SYM[x.currency]}）`
    : `≈ ${yuan(c)} · <span class="aa-cur">按当前汇率</span>`;
  return `<div class="exp${x.settled ? ' done' : ''}">
    <span class="ico"><i data-lucide="${cat.i}"></i></span>
    <span class="t">${esc(x.title)}</span>
    <span class="amt">${money(x.amount, x.currency)}${x.settled ? '<span class="aa-tag">已结清</span>' : ''}</span>
    <span class="meta">${esc(nm(x.payer))} 付 · ${splitText(x)} · ${dayOf(x) === 'pre' ? '行前' : dayLabel(dayOf(x))}${x.note ? ' · ' + esc(x.note) : ''}</span>
    <span class="meta r">${conv}</span>
    ${mine ? `<span class="acts"><button class="del edit" data-edit="${esc(x.id)}">修改</button>${delBtn('del', x.id)}</span>` : ''}</div>`;
}
function rowPay(s) {
  return `<div class="exp pay">
    <span class="ico"><i data-lucide="arrow-right-left"></i></span>
    <span class="t">${esc(nm(s.from))} 还给 ${esc(nm(s.to))}</span>
    <span class="amt">${s.currency === 'CNY' ? yuan(s.cny) : money(s.amount, s.currency)}</span>
    <span class="meta">${METHODS[s.method] || '其他'}${s.note ? ' · ' + esc(s.note) : ''} · ${new Date(s.at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}</span>
    <span class="meta r">${s.currency === 'CNY' ? '' : '≈ ' + yuan(s.cny)}</span>
    ${Trip.mine(s) ? `<span class="acts">${delBtn('pdel', s.id)}</span>` : ''}</div>`;
}
function renderLedger() {
  $('#aaFilters').innerHTML = `<div class="chips">${[['', '全部', 'list'], ...AA_CATS].map(([k, n, i]) => `<button type="button" class="chip ${aaFilter.cat === k ? 'on' : ''}" data-fcat="${k}" aria-pressed="${aaFilter.cat === k}"><i data-lucide="${i}" class="i18"></i>${n}</button>`).join('')}</div>
    <div class="aa-tool"><select id="aaWho" aria-label="按人筛选"><option value="">所有人</option>${IDS.map(id => `<option value="${id}" ${aaFilter.who === id ? 'selected' : ''}>${esc(nm(id))}</option>`).join('')}</select>
    <input type="search" id="aaSearch" placeholder="搜索名称或备注" aria-label="搜索" value="${esc(aaFilter.q)}"></div>`;
  const qEl = $('#aaSearch'); if (aaFilter.q && document.activeElement !== qEl && aaFilter._focus) { qEl.focus(); qEl.setSelectionRange(qEl.value.length, qEl.value.length); }
  const w = aaFilter.who;
  const q = aaFilter.q.trim().toLowerCase(), hit = t => !q || String(t || '').toLowerCase().includes(q);
  const ex = expenses.filter(x => (!aaFilter.cat || (AA_CAT[x.cat] ? x.cat : 'other') === aaFilter.cat) && (!w || x.payer === w || (x.split || []).includes(w)) && (hit(x.title) || hit(x.note)));
  const ps = aaFilter.cat ? [] : settlements.filter(s => (!w || s.from === w || s.to === w) && (hit(s.note) || hit(nm(s.from) + '还给' + nm(s.to))));
  const payDay = s => dayOf({ at: s.at });
  const rows = [...ex.map(x => ({ k: x.at || 0, d: dayOf(x), c: cnyOf(x), h: rowExpense(x) })), ...ps.map(s => ({ k: s.at || 0, d: payDay(s), c: 0, h: rowPay(s) }))];
  let html = '';
  if (wideAA()) {   // desktop: grouped by trip day, newest day first, with the day's spending
    const order = d => d === 'pre' ? '0' : d;
    rows.sort((a, b) => order(b.d).localeCompare(order(a.d)) || b.k - a.k);
    let last = null;
    for (const r of rows) {
      if (r.d !== last) { last = r.d; const sum = rows.filter(x => x.d === r.d).reduce((a, x) => a + x.c, 0);
        html += `<div class="aa-gh">${r.d === 'pre' ? '行前' : `${dayLabel(r.d)} ${weekday(r.d)}`} · ${yuan(sum)}</div>`; }
      html += r.h;
    }
  } else html = rows.sort((a, b) => b.k - a.k).map(r => r.h).join('');
  $('#expList').innerHTML = rows.length ? html : `<p class="empty">${expenses.length ? '没有符合筛选的记录。' : '还没有记账。'}</p>`;
  // this browser's anonymous id: entries are editable only from the browser that recorded them
  $('#aaDev').innerHTML = uid ? `本机编号 <code>${esc(uid)}</code><button type="button" id="aaDevCopy">复制</button>（换手机或浏览器后，以前记的账要靠它转过来）` : '';
  const unlocked = expenses.filter(x => Trip.mine(x) && !(x.cny > 0));
  $('#aaLock').hidden = !unlocked.length;
  $('#aaLock').textContent = `把我的 ${unlocked.length} 笔旧账按当前汇率锁定`;
}

/* ---------- form ---------- */
function renderForm() {
  const payer = $('#expPayer').value || me || 'm1';
  $('#expPayer').innerHTML = IDS.map(id => `<option value="${id}" ${id === payer ? 'selected' : ''}>${esc(nm(id))}</option>`).join('');
  $('#aaCats').innerHTML = AA_CATS.map(([k, n, i]) => `<button type="button" class="aa-cat ${fcat === k ? 'on' : ''}" data-cat="${k}" aria-pressed="${fcat === k}" title="${n}"><i data-lucide="${i}"></i><span>${n}</span></button>`).join('');
  const dsel = $('#expDay'), dv = dsel.value;
  dsel.innerHTML = `<option value="">行前</option>` + TRIP_DAYS.map(d => `<option value="${d}">${dayLabel(d)}</option>`).join('');
  dsel.value = dv;
  document.querySelectorAll('#aaMode [data-mode]').forEach(b => { b.classList.toggle('on', b.dataset.mode === fmode); b.setAttribute('aria-pressed', b.dataset.mode === fmode); });
  const cur = $('#expCur').value;
  document.querySelectorAll('#aaCurSeg [data-cur]').forEach(b => { b.classList.toggle('on', b.dataset.cur === cur); b.setAttribute('aria-pressed', b.dataset.cur === cur); });
  const r = settings.rates || {};
  $('#aaRateMini').innerHTML = cur === 'CNY' ? '结算都按人民币' : `1¥ ≈ ${fmt(r[cur] || rate(cur), cur)}${SYM[cur]} · 记账时锁定 <button type="button" class="linkbtn" id="aaRateRefresh">更新汇率</button>`;
  $('#aaPayerAv').innerHTML = IDS.map(id => avBtn(id, 'data-payer', id === $('#expPayer').value, ' role="radio"')).join('');
  $('#expSplit').innerHTML = fmode === 'equal'
    ? `<div class="chips">${IDS.map(id => `<button type="button" class="chip ${split.has(id) ? 'on' : ''}" data-split="${id}" aria-pressed="${split.has(id)}"><span class="av sm" style="--p:var(--${id})">${esc(avOf(id))}</span>${esc(nm(id))}</button>`).join('')}</div>`
    : IDS.map(id => `<label class="aa-sv"><span>${esc(nm(id))}</span><input type="number" inputmode="decimal" step="any" min="0" data-sv="${id}" value="${fvals[id] ?? (fmode === 'shares' ? 1 : '')}" placeholder="${fmode === 'shares' ? '份数' : '金额'}"><em>${fmode === 'shares' ? '份' : SYM[cur]}</em></label>`).join('');
  splitHint();
  $('#expAdd').disabled = !ready();
}
function readVals() { const o = {}; document.querySelectorAll('[data-sv]').forEach(i => { const v = parseFloat(i.value); o[i.dataset.sv] = isFinite(v) && v > 0 ? v : 0; }); return o; }
function amountsOff() {   // amounts mode: difference between total and the sum of the parts, in the entry currency
  const amt = parseFloat($('#expAmt').value), v = readVals(), sum = Object.values(v).reduce((a, b) => a + b, 0);
  return isFinite(amt) ? amt - sum : NaN;
}
function splitHint() {
  const h = $('#aaSplitHint'), cur = $('#expCur').value;
  if (fmode !== 'amounts') { h.textContent = fmode === 'shares' ? '填 0 表示这个人不参与。' : ''; h.className = 'sub'; $('#expAdd').disabled = !ready(); return; }
  const d = amountsOff(), tol = cur === 'VND' || cur === 'KRW' ? 0.5 : 0.005;
  const ok = isFinite(d) && Math.abs(d) < tol;
  h.className = 'sub ' + (ok ? 'ok' : 'bad');
  h.textContent = !isFinite(d) ? '先填总金额' : ok ? '金额对上了' : d > 0 ? `还差 ${money(d, cur)}` : `多了 ${money(-d, cur)}`;
  $('#expAdd').disabled = !ready() || !ok;
}
function resetForm() {
  editId = null; fmode = 'equal'; fvals = {}; fcat = 'food'; split = new Set(IDS);
  $('#expForm').reset(); $('#expDay').value = TRIP_DAYS.includes(todayVN()) ? todayVN() : '';
  $('#aaFormTitle').textContent = '记一笔'; $('#expAdd').innerHTML = '<i data-lucide="plus" class="i18"></i>记一笔'; $('#aaCancelEdit').hidden = true;
  renderForm(); lucideIcons();
}
const todayVN = () => new Date(Date.now() + Trip.tz() * 3600e3).toISOString().slice(0, 10);   // today in the trip's timezone
function startEdit(id) {
  const x = expenses.find(e => e.id === id); if (!x || !Trip.mine(x)) return;
  editId = id; fmode = x.mode || 'equal'; fcat = AA_CAT[x.cat] ? x.cat : 'other';
  split = new Set((x.split || []).filter(i => IDS.includes(i)));
  fvals = fmode === 'equal' ? {} : Object.fromEntries(IDS.map(i => [i, split.has(i) ? +(x.shares || {})[i] || 0 : 0]));
  $('#expTitle').value = x.title; $('#expAmt').value = x.amount; $('#expCur').value = x.currency;
  $('#expPayer').value = x.payer; $('#expDay').value = x.day || ''; $('#expSettled').checked = !!x.settled; $('#expNote').value = x.note || '';
  $('#aaFormTitle').textContent = '修改这笔账'; $('#expAdd').innerHTML = '<i data-lucide="save" class="i18"></i>保存修改'; $('#aaCancelEdit').hidden = false;
  renderForm(); lucideIcons(); openSheet();
}
async function saveExpense(e) {
  e.preventDefault();
  const title = $('#expTitle').value.trim(), amount = parseFloat($('#expAmt').value), currency = $('#expCur').value;
  if (!title) return toast('先写花在什么上');
  if (!(amount > 0)) return toast('金额要大于 0');
  let parts, shares;
  if (fmode === 'equal') parts = IDS.filter(id => split.has(id));
  else { const v = readVals(); parts = IDS.filter(id => v[id] > 0); shares = Object.fromEntries(parts.map(id => [id, v[id]])); }
  if (!parts.length) return toast('至少选一个人来分');
  if (fmode === 'amounts') { const tol = currency === 'VND' || currency === 'KRW' ? 0.5 : 0.005; if (!(Math.abs(amountsOff()) < tol)) return toast('每人金额加起来要等于总金额'); }
  const old = editId ? expenses.find(x => x.id === editId) : null;
  // lock the rate: keep the original one when editing in the same currency, otherwise today's
  const r = currency === 'CNY' ? 1 : old && old.currency === currency && old.rate > 0 ? old.rate : rate(currency);
  const doc = { title: title.slice(0, 60), amount, currency, payer: $('#expPayer').value, split: parts, mode: fmode, cny: amount / r, rate: r, cat: fcat,
    at: old ? old.at : Date.now(), by: old ? old.by : uid };
  const bm = old ? (old.byMember || me) : me; if (bm) doc.byMember = bm;   // any device of this member can edit it later
  if (shares) doc.shares = shares;
  const day = $('#expDay').value; if (day) doc.day = day;
  if ($('#expSettled').checked) doc.settled = true;
  const note = $('#expNote').value.trim().slice(0, 120); if (note) doc.note = note;
  // start the write, then clear the form right away: waiting for the server would wipe what the user types next
  const write = old ? db.doc('expenses/' + old.id).set(doc) : db.collection('expenses').add(doc);
  resetForm(); closeSheet(); toast(old ? '已保存修改' : '已记账');
  try { await write; } catch (err) { toast('保存失败，请稍后再试'); }
}

/* ---------- repayment dialog ---------- */
function openRepay(from = me || 'm1', to = '', amount = '') {
  if (!ready()) return toast('还没连上数据库');
  const opts = sel => IDS.map(id => `<option value="${id}" ${id === sel ? 'selected' : ''}>${esc(nm(id))}</option>`).join('');
  if (!to) to = IDS.find(id => id !== from);
  $('#rpFrom').innerHTML = opts(from); $('#rpTo').innerHTML = opts(to);
  $('#rpAmt').value = amount; $('#rpCur').value = 'CNY'; $('#rpNote').value = '';
  $('#rpMethods').innerHTML = Object.entries(METHODS).map(([k, n], i) => `<button type="button" class="chip ${i ? '' : 'on'}" data-method="${k}" aria-pressed="${!i}">${n}</button>`).join('');
  drawRepayAv();
  if (wideAA()) { setPanel('repay'); $('#rpAmt').focus(); return; }
  $('#aaRepay').hidden = false; $('#rpAmt').focus(); document.documentElement.style.overflow = 'hidden';
}
function drawRepayAv() {
  $('#rpFromAv').innerHTML = IDS.map(id => avBtn(id, 'data-rpfrom', id === $('#rpFrom').value)).join('');
  $('#rpToAv').innerHTML = IDS.map(id => avBtn(id, 'data-rpto', id === $('#rpTo').value)).join('');
}
const closeRepay = () => { $('#aaRepay').hidden = true; document.documentElement.style.overflow = ''; if (wideAA()) { $('#rpForm').reset(); $('#rpAmt').value = ''; setPanel('settle'); } };
// desktop: one sticky panel with three tabs; the repay form lives in it (phone: pop-up dialog)
function setPanel(t) {
  $('#aaPanel').dataset.ptab = t;
  document.querySelectorAll('.aa-ptabs [data-ptab]').forEach(b => { b.classList.toggle('on', b.dataset.ptab === t); b.setAttribute('aria-selected', b.dataset.ptab === t); });
  if (t === 'repay' && !$('#rpFrom').options.length) openRepay();
}
function placeAA() {
  const wide = wideAA(), f = $('#rpForm');
  if (wide && f.parentNode !== $('#aaRepaySlot')) { $('#aaRepaySlot').appendChild(f); $('#aaRepay').hidden = true; document.documentElement.style.overflow = ''; }
  if (!wide && f.parentNode !== $('#aaRepay')) $('#aaRepay').appendChild(f);
  if (wide) closeSheet();
}
async function saveRepay(e) {
  e.preventDefault();
  const from = $('#rpFrom').value, to = $('#rpTo').value, amount = parseFloat($('#rpAmt').value), currency = $('#rpCur').value;
  if (from === to) return toast('还款的两个人不能是同一个');
  if (!(amount > 0)) return toast('金额要大于 0');
  const method = (document.querySelector('#rpMethods .chip.on') || {}).dataset?.method || 'wechat';
  $('#rpSave').disabled = true;
  try {
    await db.collection('settlements').add({ from, to, amount, currency, cny: amount / (currency === 'CNY' ? 1 : rate(currency)), method, note: $('#rpNote').value.trim().slice(0, 60), at: Date.now(), by: uid, ...(me ? { byMember: me } : {}) });
    toast('已记下还款'); closeRepay();
  } catch (err) { toast('保存失败，请稍后再试'); }
  $('#rpSave').disabled = false;
}

/* ---------- copy ---------- */
function settlementText() {
  const s = settle(), t = new Date(Date.now() + Trip.tz() * 3600e3);
  const when = `${t.getUTCMonth() + 1}/${t.getUTCDate()} ${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`;
  const lines = [`【${(Trip.trip || {}).title || '旅行'} · 结算单】截至 ${when}`, `总花费 ¥${fmt(s.total, 'CNY')}，共 ${expenses.length} 笔`];
  if (s.clear) lines.push('已经全部结清');
  s.xfers.forEach(([a, b, m]) => lines.push(`${nm(a)} → ${nm(b)}：${yuan(m)}`));
  [...settlements].sort((a, b) => a.at - b.at).forEach(p => lines.push(`已还：${nm(p.from)} → ${nm(p.to)} ¥${fmt(p.cny, 'CNY')}（${METHODS[p.method] || '其他'}）`));
  return lines.join('\n');
}
function copySettlement() {
  const text = settlementText(), box = $('#aaCopyFallback');
  const fallback = () => { box.hidden = false; box.value = text; box.focus(); box.select(); try { box.setSelectionRange(0, text.length); } catch (e) {} toast('已选中，请手动复制'); };
  try { navigator.clipboard.writeText(text).then(() => { box.hidden = true; toast('结算单已复制，可以发到群里'); }, fallback); } catch (e) { fallback(); }
}

/* ---------- sheet (phone) ---------- */
function openSheet() {
  if (wideAA()) { $('#aaFormBox').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('#expTitle').focus(); return; }
  $('#aaFormBox').classList.add('open'); $('#aaBackdrop').hidden = false; document.documentElement.style.overflow = 'hidden';
}
function closeSheet() { $('#aaFormBox').classList.remove('open'); $('#aaBackdrop').hidden = true; document.documentElement.style.overflow = ''; }

/* ---------- render all ---------- */
function renderAA() {
  const s = settle();
  renderMe(s); renderOverview(s); renderSettle(s); renderStats(s); renderLedger();
  lucideIcons();
}

/* ---------- events ---------- */
// two-step delete on the page itself (no native dialog)
function armDelete(key, run) {
  clearTimeout(armedTimer);
  if (armedKey === key) { armedKey = ''; run(); return; }
  armedKey = key; renderLedger(); lucideIcons();
  armedTimer = setTimeout(() => { armedKey = ''; renderLedger(); lucideIcons(); }, 3500);
}
function bindAA() {
  const panel = document.querySelector('[data-panel="aa"]');
  panel.addEventListener('click', async e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.repay) { const [a, b, m] = t.dataset.repay.split('|'); openRepay(a, b, m); }
    else if (t.id === 'aaRepayBtn') openRepay();
    else if (t.id === 'aaPickMe' || t.id === 'aaPickMe2') { if (window.tripNav) tripNav.openPicker(); e.stopPropagation(); }
    else if (t.dataset.ptab && t.closest('.aa-ptabs')) setPanel(t.dataset.ptab);
    else if (t.dataset.cur) { $('#expCur').value = t.dataset.cur; renderForm(); lucideIcons(); }
    else if (t.dataset.payer) { $('#expPayer').value = t.dataset.payer; renderForm(); lucideIcons(); }
    else if (t.dataset.rpfrom) { $('#rpFrom').value = t.dataset.rpfrom; if ($('#rpTo').value === t.dataset.rpfrom) $('#rpTo').value = IDS.find(i => i !== t.dataset.rpfrom); drawRepayAv(); }
    else if (t.dataset.rpto) { $('#rpTo').value = t.dataset.rpto; drawRepayAv(); }
    else if (t.id === 'aaRateRefresh') $('#refreshRates').click();
    else if (t.id === 'aaCopy') copySettlement();
    else if (t.id === 'aaDevCopy') { try { navigator.clipboard.writeText(uid).then(() => toast('本机编号已复制'), () => toast('请长按编号手动复制')); } catch (er) { toast('请长按编号手动复制'); } }
    else if (t.id === 'aaFab') { if (editId) resetForm(); openSheet(); }
    else if (t.dataset.aaclose !== undefined) closeSheet();
    else if (t.id === 'aaCancelEdit') { resetForm(); closeSheet(); }
    else if (t.dataset.split) { const id = t.dataset.split; split.has(id) ? split.delete(id) : split.add(id); renderForm(); }
    else if (t.dataset.mode) { fvals = readVals(); fmode = t.dataset.mode; if (fmode === 'amounts') fvals = {}; if (fmode === 'shares') fvals = Object.fromEntries(IDS.map(id => [id, split.has(id) ? 1 : 0])); renderForm(); }
    else if (t.dataset.cat) { fcat = t.dataset.cat; renderForm(); lucideIcons(); }
    else if (t.dataset.fcat !== undefined) { aaFilter.cat = t.dataset.fcat; renderLedger(); lucideIcons(); }
    else if (t.dataset.edit) startEdit(t.dataset.edit);
    else if (t.dataset.del) armDelete('del:' + t.dataset.del, async () => { try { await db.doc('expenses/' + t.dataset.del).delete(); toast('已删除'); } catch (err) { toast('删除失败'); } });
    else if (t.dataset.pdel) armDelete('pdel:' + t.dataset.pdel, async () => { try { await db.doc('settlements/' + t.dataset.pdel).delete(); toast('已删除还款记录'); } catch (err) { toast('删除失败'); } });
    else if (t.id === 'aaLock') {
      const mine = expenses.filter(x => Trip.mine(x) && !(x.cny > 0)); if (!mine.length) return;
      try { const b = db.batch(); mine.forEach(x => { const r = x.currency === 'CNY' ? 1 : rate(x.currency); b.update(db.doc('expenses/' + x.id), { cny: x.amount / r, rate: r }); }); await b.commit(); toast(`已锁定 ${mine.length} 笔`); }
      catch (err) { toast('锁定失败，请稍后再试'); }
    }
  });
  panel.addEventListener('change', e => {
    if (e.target.id === 'aaWho') { aaFilter.who = e.target.value; renderLedger(); lucideIcons(); }
    else if (e.target.id === 'expCur') { renderForm(); }
  });
  panel.addEventListener('input', e => { if (e.target.id === 'aaSearch') { aaFilter.q = e.target.value; aaFilter._focus = true; renderLedger(); lucideIcons(); return; } });
  panel.addEventListener('input', e => { if (e.target.dataset.sv || e.target.id === 'expAmt') { if (e.target.dataset.sv) fvals = readVals(); splitHint(); } });
  $('#expForm').addEventListener('submit', saveExpense);
  $('#aaBackdrop').addEventListener('click', closeSheet);
  $('#rpForm').addEventListener('submit', saveRepay);
  // the repay form may sit in the desktop panel, outside #aaRepay: handle its clicks there too
  $('#rpForm').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.rpfrom) { $('#rpFrom').value = b.dataset.rpfrom; if ($('#rpTo').value === b.dataset.rpfrom) $('#rpTo').value = IDS.find(i => i !== b.dataset.rpfrom); drawRepayAv(); }
    else if (b.dataset.rpto) { $('#rpTo').value = b.dataset.rpto; drawRepayAv(); }
    else if (b.dataset.method) document.querySelectorAll('#rpMethods .chip').forEach(c => { c.classList.toggle('on', c === b); c.setAttribute('aria-pressed', c === b); });
    else if (b.dataset.rpclose !== undefined && wideAA()) closeRepay();
  });
  ['rpFrom', 'rpTo'].forEach(id => $('#' + id).addEventListener('change', drawRepayAv));
  const mq = matchMedia('(min-width:1200px)');
  const onMq = () => { placeAA(); if (mq.matches) $('.c-stats').open = false; renderLedger(); lucideIcons(); };
  (mq.addEventListener ? mq.addEventListener('change', onMq) : mq.addListener(onMq));
  placeAA(); if (mq.matches) $('.c-stats').open = false; setPanel('add');
  $('#aaRepay').addEventListener('click', e => {
    if (e.target === $('#aaRepay') || e.target.closest('[data-rpclose]')) closeRepay();
    const m = e.target.closest('[data-method]'); if (m) document.querySelectorAll('#rpMethods .chip').forEach(c => { c.classList.toggle('on', c === m); c.setAttribute('aria-pressed', c === m); });
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') { closeSheet(); closeRepay(); } });
  resetForm();
}
function subscribeAA(db) {
  db.collection('expenses').onSnapshot(s => { expenses = s.docs.map(d => ({ id: d.id, ...d.data() })); renderAA(); }, () => {});
  db.collection('settlements').onSnapshot(s => { settlements = s.docs.map(d => ({ id: d.id, ...d.data() })); renderAA(); }, () => {});
}
