// What a new trip starts with, modelled on the Vietnam trip: the same packing categories, personal checklist,
// tips, emergency numbers and 出发前要办 notes, with the country-specific parts filled from countries.js.
// Templates use {placeholders}; fill() swaps them for the trip's country. Browser: window.TripPresets; Node: require.
(function (root) {
  const C = root.TripCountries || (typeof require !== 'undefined' ? require('./countries.js') : null);
  const it = (k, label, w, note) => ({ k, label, w, ...(note ? { note } : {}) });

  // v2: rebuilt from the Vietnam trip (v1 was a short generic list)
  const TEMPLATES = {
    base: { v: 2, title: '所有旅行',
      packing: [
        { id: 'docs', label: '证件', icon: 'id-card', items: [it('passport', '护照', 'carry'), it('visa', '签证或入境许可（打印件或截图）', 'carry'), it('itinerary', '机票行程单', 'carry'),
          it('hotelconf', '酒店确认单截图', 'carry'), it('ppcopy', '护照照片页复印件', 'check', '和护照分开放')] },
        { id: 'money', label: '钱', icon: 'banknote', items: [it('cash', '{cash}现金', 'carry', '{pay}'), it('card', 'Visa 或万事达卡', 'carry'),
          it('homecash', '一点人民币或韩元', 'carry', '回国路上用')] },
        { id: 'elec', label: '电子', icon: 'smartphone', items: [it('phone', '手机', 'carry'), it('cable', '充电线', 'carry'), it('powerbank', '充电宝', 'carry', '必须随身，不能托运'),
          it('adapter', '转换头', 'check', '{plug}'), it('earphones', '耳机', 'carry')] },
        { id: 'clothes', label: '衣物', icon: 'shirt', items: [it('tees', '换洗衣服', 'check'), it('jacket', '薄外套', 'carry', '飞机和车上空调冷'), it('umbrella', '雨衣或折叠伞', 'check'),
          it('slippers', '拖鞋', 'check'), it('pajamas', '睡衣', 'check')] },
        { id: 'toilet', label: '洗漱和防晒', icon: 'sun', items: [it('toothbrush', '牙刷牙膏', 'check'), it('sunscreen', '防晒霜', 'check', '超过 100ml 要托运')] },
        { id: 'meds', label: '药品', icon: 'pill', items: [it('stomach', '肠胃药', 'check'), it('bandaid', '创可贴', 'check'), it('mymeds', '个人常用药', 'carry')] },
      ],
      checklist: [{ k: 'passport', label: '护照有效期 6 个月以上' }, { k: 'visa', label: '{visa}' }, { k: 'ticket', label: '机票已出票' },
        { k: 'esim', label: '{esim} eSIM / 流量' }, { k: 'app', label: '装好 {app}' }, { k: 'cash', label: '换一些{cash}' }, { k: 'insurance', label: '旅行保险' }] },
    beach: { v: 2, title: '海岛 / 海边',
      packing: [
        { id: 'clothes', label: '衣物', icon: 'shirt', items: [it('swim', '泳衣', 'check')] },
        { id: 'toilet', label: '洗漱和防晒', icon: 'sun', items: [it('repellent', '驱蚊液', 'check'), it('aftersun', '晒后修复', 'check')] },
        { id: 'meds', label: '药品', icon: 'pill', items: [it('seasick', '晕船药', 'carry', '坐船那天')] },
        { id: 'island', label: '下水那天', icon: 'sailboat', items: [it('drybag', '防水手机袋', 'carry'), it('towel', '毛巾', 'check'), it('change', '换洗衣服', 'carry')] },
      ], checklist: [] },
    city: { v: 2, title: '城市游',
      packing: [
        { id: 'clothes', label: '衣物', icon: 'shirt', items: [it('shoes', '好走的鞋', 'check')] },
        { id: 'city', label: '城市', icon: 'train-front', items: [it('transitcard', '交通卡（悠游卡、T-money…）', 'carry'), it('tote', '购物袋', 'carry')] },
      ], checklist: [{ k: 'transit', label: '查好机场到市区的交通' }] },
    cold: { v: 2, title: '冬天',
      packing: [{ id: 'cold', label: '保暖', icon: 'snowflake', items: [it('downjacket', '羽绒服', 'carry'), it('heatpads', '暖宝宝', 'check'),
        it('moisturizer', '保湿霜、润唇膏', 'check'), it('gloves', '手套、围巾、帽子', 'check')] }], checklist: [] },
    overnight: { v: 2, title: '夜车 / 红眼航班',
      packing: [{ id: 'bus', label: '过夜路上', icon: 'bus', items: [it('pillow', '颈枕', 'carry'), it('eyemask', '眼罩', 'carry'), it('earplugs', '耳塞', 'carry'),
        it('tissues', '纸巾和湿巾', 'carry')] }], checklist: [] },
  };
  const NAMES = { base: '所有旅行都要的', beach: '海岛 / 海边', city: '城市游', cold: '冬天', overnight: '夜车 / 红眼航班' };

  // merge templates: packing categories by id (items unique by key, base order first), checklist unique by key
  function merge(list) {
    const cats = [], chk = [];
    for (const t of list) {
      for (const c of t.packing || []) { let x = cats.find(y => y.id === c.id); if (!x) { x = { ...c, items: [] }; cats.push(x); } for (const i of c.items || []) if (!x.items.some(j => j.k === i.k)) x.items.push(i); }
      for (const i of t.checklist || []) if (!chk.some(j => j.k === i.k)) chk.push(i);
    }
    return { packingItems: cats, checklistItems: chk };
  }
  // {cash} {pay} {plug} {visa} {esim} {app} → the country's wording; rows that end up empty are dropped
  function fill(v, c) {
    if (Array.isArray(v)) return v.map(x => fill(x, c)).filter(x => x !== null);
    if (v && typeof v === 'object') {
      const o = {}; for (const [k, x] of Object.entries(v)) { const y = fill(x, c); if (y !== null && y !== '') o[k] = y; }
      return ('label' in v && !o.label) ? null : o;
    }
    if (typeof v !== 'string') return v;
    let missing = false;
    const s = v.replace(/\{(\w+)\}/g, (_, k) => { const x = (c || {})[k]; if (!x) missing = true; return x || ''; });
    return missing ? '' : s;   // e.g. no {cash} for China → the 现金 row disappears
  }

  // info/static for a new trip: same sections as Vietnam
  function info(code, templates) {
    const c = (C && C.byCode(code)) || { name: code, cur: 'CNY', sos: [], utc: 8 };
    const { packingItems, checklistItems } = fill(merge(templates), c);
    const tips = [['时差', C ? C.timeDiff(c.utc) : ''], ['插座', c.plug], ['喝水', c.water], ['付钱', c.pay]].filter(([, v]) => v).map(([k, v]) => ({ k, v }));
    const guideNotes = [
      c.visa && { title: '签证', text: `出发前确认：${c.visa}。` },
      (c.esim || c.app) && { title: '手机和打车', text: [c.esim && `买${c.esim} eSIM`, c.app && `装好 ${c.app}`].filter(Boolean).join('，') + '。' },
      c.cash && { title: '钱', text: `${c.cash}现金备一些。${c.pay ? c.pay + '。' : ''}` },
    ].filter(Boolean);
    return { flights: [], hotels: [], transport: [], group: [], personal: checklistItems, checklistItems, phrases: [], tips,
      sos: (c.sos || []).map(([label, number]) => ({ label, number })), packingItems, stays: [], notices: [], highlight: null, guideNotes };
  }

  const api = { TEMPLATES, NAMES, merge, fill, info };
  root.TripPresets = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
