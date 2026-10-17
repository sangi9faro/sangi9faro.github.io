// Country defaults for new trips: local currency, emergency numbers, an id slug,
// plus the practical lines every trip page shows (modelled on the Vietnam trip): UTC offset, plugs, water,
// ride-hailing app, cash, entry papers, eSIM. Runs in the browser (window.TripCountries) and in Node (require).
(function (root) {
  const C = [
    { code: 'TW', name: '台湾', slug: 'taiwan', cur: 'TWD', cash: '新台币', utc: 8, app: 'Uber', esim: '台湾',
      sos: [['报警', '110'], ['火警 / 急救', '119']],
      plug: '110V，两脚扁插；国内两脚扁插直接能用，三脚插头要转换头', water: '自来水不要直接喝，便利店买水或用饭店饮水机',
      visa: '入台证（大陆护照需要，以台湾移民署官方说明为准）', pay: '夜市和小店多数只收现金；悠游卡能坐捷运，也能在便利店付款' },
    { code: 'VN', name: '越南', slug: 'vietnam', cur: 'VND', cash: '越南盾', utc: 7, app: 'Grab', esim: '越南',
      sos: [['报警', '113'], ['火警', '114'], ['急救', '115']],
      plug: '220V，两脚扁插、两脚圆插大多能用，带个转换头保险', water: '不要喝自来水，买瓶装水',
      visa: '越南电子签 / 确认免签', pay: '夜市和小店多数只收现金' },
    { code: 'KR', name: '韩国', slug: 'korea', cur: 'KRW', cash: '韩元', utc: 9, app: 'Kakao T', esim: '韩国',
      sos: [['报警', '112'], ['火警 / 急救', '119']],
      plug: '220V，两脚圆插；国内插头要转换头', water: '自来水能喝，多数人还是买瓶装水',
      visa: '韩国签证 / K-ETA（按护照确认）', pay: '刷卡几乎到处都行，T-money 卡坐地铁公交' },
    { code: 'JP', name: '日本', slug: 'japan', cur: 'JPY', cash: '日元', utc: 9, app: 'GO 或 Uber', esim: '日本',
      sos: [['报警', '110'], ['火警 / 急救', '119']],
      plug: '100V，两脚扁插；国内两脚扁插直接能用，三脚插头要转换头', water: '自来水可以直接喝',
      visa: '日本签证（按护照确认）', pay: '小店和神社常常只收现金；交通卡（Suica 等）能坐车和在便利店付款' },
    { code: 'TH', name: '泰国', slug: 'thailand', cur: 'THB', cash: '泰铢', utc: 7, app: 'Grab 或 Bolt', esim: '泰国',
      sos: [['报警', '191'], ['旅游警察', '1155'], ['急救', '1669']],
      plug: '220V，两脚扁插、两脚圆插大多能用', water: '不要喝自来水，买瓶装水',
      visa: '泰国签证 / 免签（按护照确认）', pay: '夜市和小摊只收现金' },
    { code: 'HK', name: '香港', slug: 'hongkong', cur: 'HKD', cash: '港币', utc: 8, app: 'Uber', esim: '香港',
      sos: [['报警 / 火警 / 急救', '999']],
      plug: '220V，英式三脚方插，要转换头', water: '自来水达标，多数人煮开或买瓶装水',
      visa: '港澳通行证 / 入境要求（按证件确认）', pay: '八达通能坐车，也能在便利店付款' },
    { code: 'SG', name: '新加坡', slug: 'singapore', cur: 'SGD', cash: '新加坡元', utc: 8, app: 'Grab', esim: '新加坡',
      sos: [['报警', '999'], ['火警 / 急救', '995']],
      plug: '230V，英式三脚方插，要转换头', water: '自来水可以直接喝',
      visa: '新加坡入境卡（SG Arrival Card，出发前网上填）', pay: '刷卡几乎到处都行，小贩中心备点现金' },
    { code: 'MY', name: '马来西亚', slug: 'malaysia', cur: 'MYR', cash: '林吉特', utc: 8, app: 'Grab', esim: '马来西亚',
      sos: [['报警 / 急救', '999'], ['火警', '994']],
      plug: '240V，英式三脚方插，要转换头', water: '不要喝自来水，买瓶装水',
      visa: '马来西亚入境卡（MDAC，出发前网上填）', pay: '夜市和小摊只收现金' },
    { code: 'CN', name: '中国', slug: 'china', cur: 'CNY', cash: '', utc: 8, app: '滴滴', esim: '',
      sos: [['报警', '110'], ['火警', '119'], ['急救', '120']],
      plug: '220V，两脚扁插和三脚插座都有', water: '不要喝生水',
      visa: '', pay: '微信、支付宝几乎到处能用' },
  ];
  C.byCode = c => C.find(x => x.code === c) || null;
  // "比北京晚 1 小时，比首尔晚 2 小时"
  C.timeDiff = utc => {
    const d = (h, city) => h === 0 ? `和${city}一样` : `比${city}${h > 0 ? '早' : '晚'} ${Math.abs(h)} 小时`;
    return `${d(utc - 8, '北京')}，${d(utc - 9, '首尔')}`;
  };
  root.TripCountries = C;
  if (typeof module !== 'undefined') module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
