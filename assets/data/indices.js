/* 环球指数清单（单一数据源，浏览器与 Node 服务端共用）
   sym = 新浪符号 (int_/b_/s_/gb_$ 等)；em = 东方财富 secid (市场.代码，已停用)
   注意：新浪 int_sp500/int_dji/int_nasdaq/int_nikkei 返回的是陈旧快照(2024-25年水平)，
   已改用实时符号 b_SPX / gb_$dji / gb_$ixic / b_NKY（server.js 的 parseSina 已兼容两种字段格式）。
   city = 交易所所在城市（地图定位到交易所，而非首都）；lat/lng 为该城市坐标
   修改指数列表只改这一处即可。 */
(function (root, factory) {
  var INDICES = [
    // —— 北美洲 ——
    { sym: 'b_SPX',     country: '美国', city: '纽约', region: 'na', name: '标普500', lat: 40.7128, lng: -74.0060, em: '100.SPX' },
    { sym: 'gb_$dji',   country: '美国', city: '纽约', region: 'na', name: '道琼斯', lat: 40.7128, lng: -74.0060, em: '100.DJIA' },
    { sym: 'gb_$ixic',  country: '美国', city: '纽约', region: 'na', name: '纳斯达克', lat: 40.7128, lng: -74.0060, em: '100.NDX' },
    { sym: 'b_SPTSX',    country: '加拿大', city: '多伦多', region: 'na', name: '标普/TSX', lat: 43.6532, lng: -79.3832, em: '100.TSX' },
    { sym: 'b_MEXBOL',   country: '墨西哥', city: '墨西哥城', region: 'na', name: '墨西哥BOLSA', lat: 19.4326, lng: -99.1332, em: '100.MXX' },
    // —— 南美洲 ——
    { sym: 'b_IBOV',     country: '巴西', city: '圣保罗', region: 'sa', name: '巴西IBOVESPA', lat: -23.5505, lng: -46.6333, em: '100.BVSP' },
    { sym: 'b_MERVAL',   country: '阿根廷', city: '布宜诺斯艾利斯', region: 'sa', name: '阿根廷MERVAL', lat: -34.6037, lng: -58.3816, em: '100.MERVAL' },
    // —— 欧洲 ——
    { sym: 'b_UKX',      country: '英国', city: '伦敦', region: 'eu', name: '富时100', lat: 51.5074, lng: -0.1278, em: '100.FTSE' },
    { sym: 'b_DAX',      country: '德国', city: '法兰克福', region: 'eu', name: '德国DAX', lat: 50.1109, lng: 8.6821, em: '100.GDAXI' },
    { sym: 'b_CAC',      country: '法国', city: '巴黎', region: 'eu', name: '法国CAC40', lat: 48.8566, lng: 2.3522, em: '100.FCHI' },
    { sym: 'b_SMI',      country: '瑞士', city: '苏黎世', region: 'eu', name: '瑞士SMI', lat: 47.3769, lng: 8.5417, em: '100.SSMI' },
    { sym: 'b_AEX',      country: '荷兰', city: '阿姆斯特丹', region: 'eu', name: '荷兰AEX', lat: 52.3676, lng: 4.9041, em: '100.AEX' },
    { sym: 'b_FTSEMIB',  country: '意大利', city: '米兰', region: 'eu', name: '意大利MIB', lat: 45.4642, lng: 9.1900, em: '100.MIB' },
    { sym: 'b_IBEX',     country: '西班牙', city: '马德里', region: 'eu', name: '西班牙IBEX35', lat: 40.4168, lng: -3.7038, em: '100.IBEX' },
    { sym: 'b_OMX',      country: '瑞典', city: '斯德哥尔摩', region: 'eu', name: '瑞典OMX30', lat: 59.3293, lng: 18.0686, em: '100.OMXSPI' },
    { sym: 'b_HEX',      country: '芬兰', city: '赫尔辛基', region: 'eu', name: '芬兰OMX', lat: 60.1699, lng: 24.9384, em: '100.HEX' },
    { sym: 'b_OSEAX',    country: '挪威', city: '奥斯陆', region: 'eu', name: '挪威OSE', lat: 59.9139, lng: 10.7522, em: '100.OSEBX' },
    { sym: 'b_ISEQ',     country: '爱尔兰', city: '都柏林', region: 'eu', name: '爱尔兰ISEQ', lat: 53.3498, lng: -6.2603, em: '100.ISEQ' },
    { sym: 'b_INDEXCF',  country: '俄罗斯', city: '莫斯科', region: 'eu', name: '俄罗斯RTS', lat: 55.7558, lng: 37.6173, em: '100.RTS' },
    { sym: 'b_SX5E',     country: '欧元区', city: '布鲁塞尔', region: 'eu', name: '欧元区斯托克50', lat: 50.8503, lng: 4.3517, em: '100.SX5E' },
    // —— 非洲 ——
    { sym: 'b_JALSH',    country: '南非', city: '约翰内斯堡', region: 'af', name: '南非综合', lat: -26.2041, lng: 28.0473, em: '100.JTOPI' },
    { sym: 'b_CASE',     country: '埃及', city: '开罗', region: 'af', name: '埃及CASE30', lat: 30.0444, lng: 31.2357, em: '100.EGX' },
    // —— 亚洲 ——
    { sym: 's_sh000001', country: '中国', city: '上海', region: 'as', name: '上证指数', lat: 31.2304, lng: 121.4737, em: '1.000001' },
    { sym: 's_sz399001', country: '中国', city: '深圳', region: 'as', name: '深证成指', lat: 22.5431, lng: 114.0579, em: '0.399001' },
    { sym: 'int_hangseng', country: '中国香港', city: '香港', region: 'as', name: '恒生指数', lat: 22.3193, lng: 114.1694, em: '100.HSI' },
    { sym: 'b_NKY', country: '日本', city: '东京', region: 'as', name: '日经225', lat: 35.6762, lng: 139.6503, em: '100.N225' },
    { sym: 'b_KOSPI',    country: '韩国', city: '首尔', region: 'as', name: '韩国KOSPI', lat: 37.5665, lng: 126.9780, em: '100.KS11' },
    { sym: 'b_TWSE',     country: '中国台湾', city: '台北', region: 'as', name: '台湾加权', lat: 25.0330, lng: 121.5654, em: '100.TWII' },
    { sym: 'b_FSSTI',    country: '新加坡', city: '新加坡', region: 'as', name: '富时新加坡海峡时报', lat: 1.3521, lng: 103.8198, em: '100.STI' },
    { sym: 'b_SENSEX',   country: '印度', city: '孟买', region: 'as', name: '印度SENSEX', lat: 19.0760, lng: 72.8777, em: '100.SENSEX' },
    { sym: 'b_JCI',      country: '印度尼西亚', city: '雅加达', region: 'as', name: '印尼雅加达综指', lat: -6.2088, lng: 106.8456, em: '100.JKSE' },
    { sym: 'b_FBMKLCI',  country: '马来西亚', city: '吉隆坡', region: 'as', name: '马来西亚KLCI', lat: 3.1390, lng: 101.6869, em: '100.KLSE' },
    { sym: 'b_SET',      country: '泰国', city: '曼谷', region: 'as', name: '泰国SET', lat: 13.7563, lng: 100.5018, em: '100.SET' },
    { sym: 'b_PCOMP',    country: '菲律宾', city: '马尼拉', region: 'as', name: '菲律宾PSEi', lat: 14.5995, lng: 120.9842, em: '100.PSI' },
    { sym: 'b_KSE100',   country: '巴基斯坦', city: '卡拉奇', region: 'as', name: '巴基斯坦KSE100', lat: 24.8607, lng: 67.0011, em: '100.KSE100' },
    { sym: 'b_VNINDEX',  country: '越南', city: '胡志明市', region: 'as', name: '越南胡志明', lat: 10.8231, lng: 106.6297, em: '100.VNINDEX' },
    { sym: 'b_XU100',    country: '土耳其', city: '伊斯坦布尔', region: 'as', name: '土耳其ISE100', lat: 41.0082, lng: 28.9784, em: '100.XU030' },
    { sym: 'b_SASEIDX',  country: '沙特阿拉伯', city: '利雅得', region: 'as', name: '沙特Tadawul', lat: 24.7136, lng: 46.6753, em: '100.FISAULMU' },
    { sym: 'b_CSEALL',   country: '斯里兰卡', city: '科伦坡', region: 'as', name: '斯里兰卡CSE', lat: 6.9271, lng: 79.8612, em: '100.CSEALL' },
    // —— 大洋洲 ——
    { sym: 'b_AS51',     country: '澳大利亚', city: '悉尼', region: 'oc', name: '澳洲标普200', lat: -33.8688, lng: 151.2093, em: '100.AS51' },
    { sym: 'b_NZSE50FG', country: '新西兰', city: '惠灵顿', region: 'oc', name: '新西兰50', lat: -41.2865, lng: 174.7762, em: '100.NZ50' }
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = INDICES;
  else root.GLOBAL_INDICES = INDICES;
})(typeof self !== 'undefined' ? self : this, function () {});
