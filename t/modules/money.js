// AA money math shared by bills.js (index.html) and the guide's 账单 shortcut. No DOM, no Firebase.
// rate(c): units of currency c per 1 CNY (CNY → 1). Entries with a locked `cny` never use today's rate.
(function () {
  const cnyOf = (x, rate) => x.cny > 0 ? x.cny : x.amount / rate(x.currency);
  // each participant's share of one expense, in CNY (equal / shares / amounts; no mode = equal)
  function sharesOf(x, ids, rate) {
    const parts = (x.split || []).filter(id => ids.includes(id)), c = cnyOf(x, rate), out = {};
    if (!parts.length) return out;
    const w = x.mode === 'shares' || x.mode === 'amounts' ? parts.map(id => Math.max(0, +(x.shares || {})[id] || 0)) : parts.map(() => 1);
    const sum = w.reduce((a, b) => a + b, 0);
    parts.forEach((id, i) => { out[id] = sum > 0 ? c * w[i] / sum : c / parts.length; });
    return out;
  }
  // balance = paid − owed + repaid out − repaid in; settled-on-the-spot entries count for totals only
  function balances(expenses, settlements, ids, rate) {
    const z = () => Object.fromEntries(ids.map(id => [id, 0]));
    const bal = z(), paid = z(), share = z(), spend = z(); let total = 0;
    for (const x of expenses) {
      const c = cnyOf(x, rate), sh = sharesOf(x, ids, rate); total += c;
      for (const id in sh) spend[id] += sh[id];
      if (x.settled || !ids.includes(x.payer) || !Object.keys(sh).length) continue;
      paid[x.payer] += c; bal[x.payer] += c;
      for (const id in sh) { share[id] += sh[id]; bal[id] -= sh[id]; }
    }
    for (const s of settlements) { if (!ids.includes(s.from) || !ids.includes(s.to)) continue; bal[s.from] += s.cny; bal[s.to] -= s.cny; }
    return { total, bal, paid, share, spend };
  }
  window.TripMoney = { cnyOf, sharesOf, balances };
})();
