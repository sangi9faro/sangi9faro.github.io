// /t/ shared core: one code base for every trip.
// Reads ?id=<tripId> (and an optional &join=<code>), signs in, joins the trip if invited, loads trips/{id} and
// info/static, and hands each page a `db` whose paths are scoped to trips/{id}/… ('meta/settings' = the trip doc).
// Pages then call Trip.start() instead of setting up Firebase themselves.
(function () {
  const qs = new URLSearchParams(location.search);
  const id = (qs.get('id') || '').trim();
  const OWNER = 'X8BxRGYdemf6Wwb9MtQcLAxpy5q2';
  // local testing: localhost (or ?emu=1 off the live site) uses the Firebase emulators, never the live project
  const EMU = !/github\.io$/.test(location.hostname) && (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || qs.has('emu'));
  const ME_KEY = 'trip-me:' + id;
  const TZ = { VN: 7, TH: 7, ID: 7, TW: 8, CN: 8, HK: 8, MO: 8, SG: 8, MY: 8, PH: 8, KR: 9, JP: 9 };   // hours ahead of UTC
  const SYM = { CNY: '¥', VND: '₫', KRW: '₩', USD: '$', TWD: 'NT$', JPY: '円', THB: '฿', HKD: 'HK$', EUR: '€', SGD: 'S$', MYR: 'RM' };
  const CUR_NAME = { CNY: '人民币', VND: '越南盾', KRW: '韩元', USD: '美元', TWD: '新台币', JPY: '日元', THB: '泰铢', HKD: '港币', EUR: '欧元', SGD: '新加坡元', MYR: '马来西亚林吉特' };
  const lsGet = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const lsSet = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} };
  const link = (page, hash) => `${page}?id=${encodeURIComponent(id)}${EMU && qs.has('emu') ? '&emu=1' : ''}${hash ? '#' + hash : ''}`;

  const listeners = [];
  const Trip = {
    id, EMU, OWNER, SYM, CUR_NAME, link,
    trip: null, info: {}, me: '', uid: null, isOwner: false, isMember: false, canEdit: false,
    onTrip(cb) { listeners.push(cb); if (Trip.trip) cb(Trip.trip); },
    // the trip's timezone offset in hours (for countdowns and "today")
    tz() { return TZ[(Trip.trip || {}).countryCode] ?? 8; },
    startMs() { const t = Trip.trip || {}; const h = Trip.tz(); return Date.parse(`${t.start}T00:00:00${h >= 0 ? '+' : '-'}${String(Math.abs(h)).padStart(2, '0')}:00`); },
    endMs() { const t = Trip.trip || {}; const h = Trip.tz(); return Date.parse(`${t.end}T23:59:59${h >= 0 ? '+' : '-'}${String(Math.abs(h)).padStart(2, '0')}:00`); },
    memberIds() { return Object.keys((Trip.trip || {}).members || {}).sort(); },
    currencies() { const t = Trip.trip || {}; const list = [...(t.currencies || [])]; if (t.baseCurrency && !list.includes(t.baseCurrency)) list.push(t.baseCurrency); return list.length ? list : ['CNY']; },
    local() { return (Trip.trip && (Trip.trip.currencies || [])[0]) || 'CNY'; },
    // an entry is mine if this device wrote it, or the same member did on another device
    mine(x) { return !!x && (x.by === Trip.uid || (!!x.byMember && x.byMember === Trip.me)); },
    async setMe(m) {
      Trip.me = m || ''; lsSet(ME_KEY, Trip.me);
      if (Trip.isMember && !Trip.isOwner) {
        try { await firebase.firestore().doc(`trips/${id}/members/${Trip.uid}`).update({ member: Trip.me || null, at: Date.now() }); } catch (e) {}
      }
    },
    start,
  };
  window.Trip = Trip;

  function loadScript(src) { return new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.async = false; el.onload = res; el.onerror = () => rej(new Error(src)); document.head.appendChild(el); }); }
  function screen(title, text, extra = '') {   // full-page message (no trip, no access)
    document.body.insertAdjacentHTML('beforeend', `<div class="trip-screen" role="alert"><div class="card"><h2>${title}</h2><p class="sub">${text}</p>${extra}</div></div>`);
  }

  // Firestore wrapper: same API the pages already use, paths scoped to trips/{id}
  function scoped(fs) {
    const base = 'trips/' + id, map = p => (p === 'meta/settings' ? base : base + '/' + String(p).replace(/^\/+/, ''));
    return { collection: p => fs.collection(map(p)), doc: p => fs.doc(map(p)), batch: () => fs.batch(), runTransaction: f => fs.runTransaction(f),
      collectionGroup: n => fs.collectionGroup(n), raw: fs };
  }

  // info/static → the window.TRIP_* data the feature code reads
  function applyInfo(info) {
    const rows = (a, f) => Array.isArray(a) ? a.map(f) : [];
    window.TRIP_FLIGHTS = info.flights || [];
    window.TRIP_HOTELS = info.hotels || [];
    window.TRIP_TRANSPORT = info.transport || [];
    window.TRIP_GROUP = rows(info.group, x => [x.k, x.label]);
    window.TRIP_PERSONAL = rows(info.personal || info.checklistItems, x => [x.k, x.label]);
    window.TRIP_PHRASES = rows(info.phrases, x => [x.vi, x.py, x.zh]);
    window.TRIP_TIPS = rows(info.tips, x => [x.k, x.v]);
    window.TRIP_SOS = rows(info.sos, x => [x.label, x.number, x.url]);
    window.TRIP_STAYS = rows(info.stays, x => [x.k, x.label]);
    window.TRIP_NOTICES = info.notices || [];
    window.TRIP_HIGHLIGHT = info.highlight || null;
    window.TRIP_GUIDE_NOTES = info.guideNotes || [];
    window.TRIP_PACKING = rows(info.packingItems, c => ({ id: c.id, label: c.label, icon: c.icon, items: rows(c.items, i => [i.k, i.label, i.w, i.note, i.strong ? 1 : 0]) }));
  }

  // the owner gets 编辑旅行信息 / 邀请 in the avatar menu (modules loaded only for them)
  async function ownerTools(fs) {
    try { for (const m of ['cover', 'countries', 'editor', 'invite']) if (!document.querySelector(`script[src="modules/${m}.js"]`)) await loadScript(`modules/${m}.js`); } catch (e) { return; }
    const items = [
      { label: '编辑旅行信息', icon: 'pencil', run: () => TripEditor.edit({ fs, tripId: id, trip: Trip.trip, onSaved: () => location.reload() }) },
      { label: '邀请同行的人', icon: 'user-plus', run: () => TripInvite.open({ fs, tripId: id, trip: Trip.trip }) },
    ];
    if (window.tripNav) tripNav.configure({ ownerItems: items });
    if (!document.querySelector('.tn-me:not([hidden])') && window.tripNav) tripNav.configure({ members: (Trip.trip || {}).members || {} });
  }
  async function start() {
    if (!id) { screen('找不到这次旅行', '链接里缺少旅行 id。请从「我的旅行」首页重新打开。', '<a class="btn" href="/">回到我的旅行</a>'); throw new Error('no trip id'); }
    const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
    for (const s of [SDK + 'firebase-app-compat.js', SDK + 'firebase-auth-compat.js', SDK + 'firebase-firestore-compat.js', '/firebase-config.js']) await loadScript(s);
    if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
    const auth = firebase.auth(), fs = firebase.firestore();
    if (EMU) { auth.useEmulator('http://127.0.0.1:9199', { disableWarnings: true }); fs.useEmulator('127.0.0.1', 8080); console.info('[trip] using the local Firebase emulators'); }
    // reuse an existing login (e.g. the owner's Google account on this site), otherwise sign in anonymously
    let user = await new Promise(res => { const off = auth.onAuthStateChanged(u => { off(); res(u); }); });
    if (!user) user = (await auth.signInAnonymously()).user;
    Trip.uid = user.uid; Trip.isOwner = user.uid === OWNER;
    const tripRef = fs.doc('trips/' + id), memRef = fs.doc(`trips/${id}/members/${user.uid}`);

    // invite link: join with the code, then drop it from the address bar
    const join = qs.get('join');
    let joinedNow = false;
    if (join && !Trip.isOwner) {
      try { const m = await memRef.get(); if (!m.exists) { await memRef.set({ code: join, member: null, at: Date.now() }); joinedNow = true; } }
      catch (e) {
        try { await memRef.set({ code: join, member: null, at: Date.now() }); joinedNow = true; }
        catch (e2) { screen('邀请链接无效', '这个邀请链接可能已经过期，请向旅行主人要一个新的。'); throw e2; }
      }
    }
    if (join) { qs.delete('join'); history.replaceState(null, '', location.pathname + (qs.toString() ? '?' + qs : '') + location.hash); }

    let trip;
    try { const s = await tripRef.get(); if (!s.exists) { screen('找不到这次旅行', '这个旅行不存在，或者已经被删除。', '<a class="btn" href="/">回到我的旅行</a>'); throw new Error('no trip'); } trip = s.data(); }
    catch (e) { if (e.message !== 'no trip') screen('这次旅行只对成员开放', '请用旅行主人发给你的邀请链接打开，加入以后就能看到全部内容。', '<a class="btn" href="/">回到我的旅行</a>'); throw e; }
    Trip.trip = trip;
    let member = null;
    try { const m = await memRef.get(); Trip.isMember = Trip.isOwner || m.exists; member = m.exists ? (m.data().member || '') : null; }
    catch (e) { Trip.isMember = Trip.isOwner; }
    Trip.canEdit = Trip.isMember;
    try { const i = await fs.doc(`trips/${id}/info/static`).get(); Trip.info = i.exists ? i.data() : {}; } catch (e) { Trip.info = {}; }
    applyInfo(Trip.info);
    // 我是谁: the server copy (this device's membership) wins; the owner keeps it on this device only
    Trip.me = member || lsGet(ME_KEY);
    if (member === '' && Trip.me && !Trip.isOwner) Trip.setMe(Trip.me);   // joined before picking: store the local choice
    document.title = `${trip.title} · ${document.title.split('·').pop().trim()}`;
    if (!Trip.canEdit) document.body.insertAdjacentHTML('afterbegin', '<div class="trip-ro" role="note">只读：用邀请链接加入这次旅行以后才能编辑</div>');
    document.body.classList.toggle('trip-readonly', !Trip.canEdit);   // hides write-only controls (ui.css)
    tripRef.onSnapshot(s => { if (!s.exists) return; Trip.trip = s.data(); listeners.forEach(cb => cb(Trip.trip)); }, () => {});
    if (Trip.isOwner) ownerTools(fs);
    if (window.tripNav) {
      tripNav.configure({ members: trip.members || {}, modules: trip.modules || {}, title: trip.title });
      if (joinedNow || (Trip.isMember && !Trip.me)) setTimeout(() => tripNav.openPicker(), 400);
    }
    return { db: scoped(fs), uid: user.uid, trip };
  }
})();
