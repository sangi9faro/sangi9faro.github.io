// Country defaults for new trips: local currency, emergency numbers, an id slug.
window.TripCountries = [
  { code: 'TW', name: '台湾', slug: 'taiwan', cur: 'TWD', sos: [['报警', '110'], ['火警 / 急救', '119']] },
  { code: 'VN', name: '越南', slug: 'vietnam', cur: 'VND', sos: [['报警', '113'], ['火警', '114'], ['急救', '115']] },
  { code: 'KR', name: '韩国', slug: 'korea', cur: 'KRW', sos: [['报警', '112'], ['火警 / 急救', '119']] },
  { code: 'JP', name: '日本', slug: 'japan', cur: 'JPY', sos: [['报警', '110'], ['火警 / 急救', '119']] },
  { code: 'TH', name: '泰国', slug: 'thailand', cur: 'THB', sos: [['报警', '191'], ['旅游警察', '1155'], ['急救', '1669']] },
  { code: 'HK', name: '香港', slug: 'hongkong', cur: 'HKD', sos: [['报警 / 火警 / 急救', '999']] },
  { code: 'SG', name: '新加坡', slug: 'singapore', cur: 'SGD', sos: [['报警', '999'], ['火警 / 急救', '995']] },
  { code: 'MY', name: '马来西亚', slug: 'malaysia', cur: 'MYR', sos: [['报警 / 急救', '999'], ['火警', '994']] },
  { code: 'CN', name: '中国', slug: 'china', cur: 'CNY', sos: [['报警', '110'], ['火警', '119'], ['急救', '120']] },
];
window.TripCountries.byCode = c => window.TripCountries.find(x => x.code === c) || null;
