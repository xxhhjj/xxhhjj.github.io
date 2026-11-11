'use strict';

/* ============================================================
   环球指数地图 前端逻辑（无服务器版）
   - 行情由 GitHub Actions 定时抓取新浪数据并生成 data/quotes.json（同源静态文件），
     浏览器每 20s 重新读取该快照即可刷新，无需本地 Node 服务代理。
   - 新浪 hq.sinajs.cn 需带 Referer，浏览器端无法设置，故由 Actions 脚本代理抓取。
   - 指数清单来自 assets/data/indices.js（window.GLOBAL_INDICES）。
   - 同一交易所城市多指数时，在城市坐标周围做微偏移避免重叠（不同城市各自用真实坐标）。
   - 按全球七大洲分区筛选；涨跌配色可切换（红涨绿跌 / 绿涨红跌）。
   ============================================================ */

const RED = '#ff4d4f';    // 红
const GREEN = '#1fd17b';  // 绿

// 全球七大洲
const REGIONS = [
  { key: 'all', label: '全部' },
  { key: 'as',  label: '亚洲' },
  { key: 'eu',  label: '欧洲' },
  { key: 'na',  label: '北美洲' },
  { key: 'sa',  label: '南美洲' },
  { key: 'af',  label: '非洲' },
  { key: 'oc',  label: '大洋洲' },
  { key: 'an',  label: '南极洲' }
];
const REGION_ORDER = ['as', 'eu', 'na', 'sa', 'af', 'oc', 'an'];

// 指数清单：来自 data/indices.js（window.GLOBAL_INDICES，与服务端共用，单一数据源）
const INDICES = window.GLOBAL_INDICES;

// 预处理：同城多指数 -> 城市坐标微偏移；不同城市各自用真实坐标，避免被推到国境/海岸之外
(function precomputeOffsets() {
  const groups = {};
  INDICES.forEach(it => { (groups[it.city] = groups[it.city] || []).push(it); });
  for (const city in groups) {
    const g = groups[city];
    const n = g.length;
    g.forEach((it, idx) => {
      if (n === 1) {
        it._lat = it.lat; it._lng = it.lng; it._side = 'right';
      } else {
        // 从正北起按圆周展开，偏向陆地一侧；半径取小值，避免漂出国境/海岸
        const ang = Math.PI / 2 + (idx / n) * Math.PI * 2;
        const r = 1.0; // 偏移半径(度)
        const cosLat = Math.max(0.35, Math.cos(it.lat * Math.PI / 180));
        it._lat = it.lat + r * Math.sin(ang);
        it._lng = it.lng + (r * Math.cos(ang)) / cosLat;
        it._side = (it._lng >= it.lng) ? 'right' : 'left';
      }
    });
  }
})();

// 背景主题
const THEMES = {
  midnight: {
    label: '深邃星空',
    bg: 'radial-gradient(1200px 700px at 70% -10%, rgba(40,90,160,0.18), transparent 60%), radial-gradient(900px 600px at 10% 110%, rgba(30,120,110,0.14), transparent 55%), linear-gradient(160deg, #0b1224, #060a14)',
    topbar: 'rgba(8,13,26,0.6)', panel: 'rgba(15,23,42,0.72)', border: 'rgba(120,170,220,0.18)',
    text: '#e6edf7', muted: '#8aa0bd', accent: '#4ea8ff',
    ctrlBg: 'rgba(78,168,255,0.12)', ctrlBgHover: 'rgba(78,168,255,0.25)',
    mapBorder: 'rgba(140,190,235,0.55)', mapArea: 'transparent', mapLabel: '#cfe0f5'
  },
  ocean: {
    label: '海洋蓝',
    bg: 'radial-gradient(1200px 700px at 50% -10%, rgba(20,120,180,0.22), transparent 60%), linear-gradient(160deg, #06283d, #021019)',
    topbar: 'rgba(6,22,36,0.6)', panel: 'rgba(8,30,48,0.72)', border: 'rgba(90,170,210,0.20)',
    text: '#e8f6ff', muted: '#7fb6d6', accent: '#39c0ff',
    ctrlBg: 'rgba(57,192,255,0.14)', ctrlBgHover: 'rgba(57,192,255,0.28)',
    mapBorder: 'rgba(120,210,255,0.6)', mapArea: 'transparent', mapLabel: '#dff4ff'
  },
  noir: {
    label: '纯黑',
    bg: '#000000',
    topbar: 'rgba(15,15,15,0.7)', panel: 'rgba(22,22,22,0.80)', border: 'rgba(255,255,255,0.12)',
    text: '#f2f2f2', muted: '#9a9a9a', accent: '#ff6b6b',
    ctrlBg: 'rgba(255,255,255,0.10)', ctrlBgHover: 'rgba(255,255,255,0.20)',
    mapBorder: 'rgba(255,255,255,0.45)', mapArea: 'transparent', mapLabel: '#eaeaea'
  },
  light: {
    label: '极简浅色',
    bg: 'radial-gradient(1000px 700px at 70% -10%, rgba(120,170,220,0.22), transparent 60%), linear-gradient(160deg, #eef3f9, #dde6f0)',
    topbar: 'rgba(255,255,255,0.7)', panel: 'rgba(255,255,255,0.85)', border: 'rgba(40,70,110,0.18)',
    text: '#16243a', muted: '#5b6b82', accent: '#1c6fd6',
    ctrlBg: 'rgba(28,111,214,0.10)', ctrlBgHover: 'rgba(28,111,214,0.20)',
    mapBorder: 'rgba(70,110,150,0.6)', mapArea: 'rgba(120,150,180,0.16)', mapLabel: '#33445c'
  }
};

// 状态
let showLabels = true;
let sortMode = 'pct';          // 'pct' | 'region'
let regionFilter = 'all';
let colorMode = 'cn';          // 'cn' 红涨绿跌 | 'intl' 绿涨红跌
let currentTheme = 'midnight';
let themeLabelColor = THEMES.midnight.mapLabel;
let lastQuotes = null;
let lastData = null;
let focusedIdx = null;        // 当前在地图中聚焦的榜单项下标
let collapsed = new Set();

const chart = echarts.init(document.getElementById('map'), null, { renderer: 'canvas' });

function fmt(n, d = 2) {
  if (n === null || n === undefined || isNaN(n)) return '--';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function signPct(p) { return (p >= 0 ? '+' : '') + fmt(p) + '%'; }

// 涨跌配色
function colorFor(pct) {
  const up = pct >= 0;
  if (colorMode === 'cn') return up ? RED : GREEN;   // 红涨绿跌
  return up ? GREEN : RED;                           // 绿涨红跌
}

// ---------- 初始化透明世界地图 ----------
async function initMap() {
  let geo = window.WORLD_GEO;
  if (!geo) {
    const res = await fetch('/data/world.json');
    geo = await res.json();
  }
  echarts.registerMap('world', geo);

  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(10,18,36,0.92)',
      borderColor: 'rgba(120,170,220,0.35)',
      textStyle: { color: '#e6edf7', fontSize: 12 },
      formatter: (p) => {
        const d = p.data && p.data.info;
        if (!d) return '';
        const cls = d.pct >= 0 ? 'upc' : 'downc';
        return `<div style="font-weight:600;margin-bottom:4px">${d.country} · ${d.city}</div>`
          + `<div style="color:#8aa0bd;font-size:11px;margin-bottom:4px">${d.indexName}</div>`
          + `<div>现价：<b>${fmt(d.price)}</b></div>`
          + `<div>涨跌：<span class="${cls}">${fmt(d.change)} (${signPct(d.pct)})</span></div>`;
      }
    },
    geo: {
      map: 'world',
      roam: true,
      left: 'center', top: 'middle', zoom: 1.15,
      itemStyle: { areaColor: 'transparent', borderColor: 'rgba(130,180,230,0.45)', borderWidth: 0.6 },
      emphasis: { itemStyle: { areaColor: 'rgba(78,168,255,0.10)' }, label: { show: false } },
      label: { show: false }
    },
    series: [{
      id: 'points',
      type: 'effectScatter',
      coordinateSystem: 'geo',
      geoIndex: 0,
      zlevel: 2,
      rippleEffect: { scale: 2.6, brushType: 'stroke' },
      showEffectOn: 'render',
      data: []
    }]
  });
}

// ---------- 组装散点 ----------
function buildSeriesData(quotes) {
  const data = [];
  for (const it of INDICES) {
    const q = quotes[it.sym];
    if (!q) continue;
    if (regionFilter !== 'all' && it.region !== regionFilter) continue;
    const pct = q.changePct || 0;
    const color = colorFor(pct);
    const size = 7 + Math.min(Math.abs(pct), 5) * 3.2;
    data.push({
      name: it.country + '·' + it.name,
      value: [it._lng, it._lat, pct],
      symbolSize: size,
      itemStyle: { color, shadowBlur: 10, shadowColor: color },
      label: {
        show: showLabels,
        position: it._side,
        formatter: `${it.country}·${it.name} ${signPct(pct)}`,
        color: themeLabelColor, fontSize: 11
      },
      info: {
        country: it.country, city: it.city, indexName: it.name,
        price: q.price, change: q.change, pct, region: it.region,
        lng: it._lng, lat: it._lat
      }
    });
  }
  return data;
}

function renderChart(quotes) {
  const data = buildSeriesData(quotes);
  data.forEach((d, i) => { d.__idx = i; }); // 记录在 series 中的下标，供榜单点击联动
  lastData = data;
  chart.setOption({ series: [{ id: 'points', data }] });
  renderList(data);
}

// 点击榜单单项 -> 地图聚焦到该国坐标并高亮
function focusCountry(idx) {
  if (idx == null || !lastData || !lastData[idx]) return;
  focusedIdx = idx;
  const d = lastData[idx];
  const lng = d.value[0], lat = d.value[1];
  chart.setOption({ geo: { center: [lng, lat], zoom: 4 } });
  chart.dispatchAction({ type: 'downplay', seriesIndex: 0 });
  chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: idx });
  chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: idx });
  document.querySelectorAll('#list .item.active').forEach(el => el.classList.remove('active'));
  const el = document.querySelector('#list .item[data-idx="' + idx + '"]');
  if (el) el.classList.add('active');
}

function resetMapView() {
  focusedIdx = null;
  chart.setOption({ geo: { center: [20, 15], zoom: 1.15 } });
  document.querySelectorAll('#list .item.active').forEach(el => el.classList.remove('active'));
}

// ---------- 侧面榜单 ----------
function renderList(data) {
  const box = document.getElementById('list');
  const toggleBtn = document.getElementById('toggleAll');
  if (sortMode === 'pct') {
    toggleBtn.style.display = 'none';
    const arr = data.slice().sort((a, b) => b.info.pct - a.info.pct);
    box.innerHTML = arr.map(itemHTML).join('');
    applyFocusedActive();
    return;
  }
  // 按大洲分组（可折叠）
  toggleBtn.style.display = '';
  updateToggleAllLabel();
  let html = '';
  for (const rk of REGION_ORDER) {
    const items = data.filter(d => d.info.region === rk);
    if (!items.length) continue;
    const label = REGIONS.find(r => r.key === rk).label;
    const isCol = collapsed.has(rk);
    items.sort((a, b) => b.info.pct - a.info.pct);
    html += `<div class="group-head${isCol ? ' collapsed' : ''}" data-region="${rk}">`
          + `<span class="tw">${isCol ? '▸' : '▾'}</span>${label}`
          + `<span class="group-count">${items.length}</span></div>`;
    if (!isCol) html += items.map(itemHTML).join('');
  }
  box.innerHTML = html || '<div class="empty">该地区暂无数据</div>';
  applyFocusedActive();
}

// 刷新后列表被重建，重新标记当前聚焦项
function applyFocusedActive() {
  if (focusedIdx == null) return;
  const el = document.querySelector('#list .item[data-idx="' + focusedIdx + '"]');
  if (el) el.classList.add('active');
}

function updateToggleAllLabel() {
  const btn = document.getElementById('toggleAll');
  if (!btn) return;
  const anyOpen = REGION_ORDER.some(r => !collapsed.has(r));
  btn.textContent = anyOpen ? '折叠全部' : '展开全部';
}

function itemHTML(d) {
  const i = d.info;
  const cls = i.pct >= 0 ? 'upc' : 'downc';
  const arrow = i.pct >= 0 ? '▲' : '▼';
  return `<div class="item" data-idx="${d.__idx}">
    <div>
      <div class="name">${i.country} · ${i.indexName}</div>
      <div class="region">${i.city}</div>
    </div>
    <div>
      <div class="price">${fmt(i.price)}</div>
      <div class="pct ${cls}">${arrow} ${signPct(i.pct)}</div>
    </div>
  </div>`;
}

// ---------- 浏览器端数据抓取（无服务器版）----------
// 行情由 GitHub Actions 定时抓取新浪数据并生成 data/quotes.json（同源静态文件，
// 无需本地服务端代理）。浏览器每 20s 重新读取该快照即可刷新。
async function loadQuotes() {
  const res = await fetch('/data/quotes.json?t=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  if (!j.quotes || !Object.keys(j.quotes).length) throw new Error('无数据（请确认 data/quotes.json 已生成）');
  return j.quotes;
}

// 保留“历史最优”数据集，避免刷新偶发失败时地图点数来回跳动
let bestQuotes = {};

// ---------- 拉取数据 ----------
async function refresh() {
  const conn = document.getElementById('conn');
  conn.className = 'conn pending';
  try {
    const quotes = await loadQuotes();
    const n = Object.keys(quotes).length;
    const bestN = Object.keys(bestQuotes).length;
    let shown, status;
    if (n === 0 && bestN === 0) {
      throw new Error('无数据（请确认 data/quotes.json 已由 Actions / fetch_quotes.py 生成）');
    } else if (n === 0 && bestN > 0) {
      shown = bestQuotes; status = 'warn';            // 本次全失败，沿用上次
    } else if (n >= bestN) {
      bestQuotes = quotes; shown = quotes; status = 'ok';
    } else {
      shown = bestQuotes; status = 'warn';            // 本次部分失败，不回退
    }
    lastQuotes = shown;
    renderChart(shown);
    const t = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const label = document.getElementById('updated');
    const srcName = '新浪';
    if (status === 'ok') label.textContent = '更新于 ' + t + ' · ' + srcName + ' · ' + n + ' 个指数';
    else if (status === 'warn') label.textContent = '沿用最近完整数据 · ' + srcName + ' · ' + n + ' 个（' + t + ' 部分失败）';
    conn.className = 'conn ' + status;
  } catch (e) {
    conn.className = 'conn err';
    let msg = '数据获取失败：' + e.message;
    if (location.protocol === 'file:') {
      msg += '（建议通过本地服务器或 GitHub Pages 访问，以便读取 data/quotes.json）';
    }
    document.getElementById('updated').textContent = msg;
  }
}

// ---------- 图例/配色 ----------
function updateLegend() {
  document.getElementById('legendUp').style.background = colorFor(1);
  document.getElementById('legendUp').style.boxShadow = '0 0 8px ' + colorFor(1);
  document.getElementById('legendDown').style.background = colorFor(-1);
  document.getElementById('legendDown').style.boxShadow = '0 0 8px ' + colorFor(-1);
  const btn = document.getElementById('colorMode');
  btn.textContent = colorMode === 'cn' ? '涨跌配色：红涨绿跌' : '涨跌配色：绿涨红跌';
}

// ---------- 背景主题 ----------
function applyTheme(key) {
  const t = THEMES[key] || THEMES.midnight;
  currentTheme = key;
  themeLabelColor = t.mapLabel;
  const r = document.documentElement.style;
  r.setProperty('--topbar', t.topbar);
  r.setProperty('--panel', t.panel);
  r.setProperty('--border', t.border);
  r.setProperty('--text', t.text);
  r.setProperty('--muted', t.muted);
  r.setProperty('--accent', t.accent);
  r.setProperty('--ctrl-bg', t.ctrlBg);
  r.setProperty('--ctrl-bg-hover', t.ctrlBgHover);
  const gimEl = document.querySelector('.gim');
  if (gimEl) gimEl.style.background = t.bg;
  chart.setOption({ geo: { itemStyle: { areaColor: t.mapArea, borderColor: t.mapBorder } } });
  if (lastQuotes) renderChart(lastQuotes);
}

// ---------- 控件 ----------
function setupControls() {
  document.getElementById('region').addEventListener('change', (e) => { regionFilter = e.target.value; resetMapView(); refresh(); });
  document.getElementById('theme').addEventListener('change', (e) => applyTheme(e.target.value));
  document.getElementById('showLabels').addEventListener('change', (e) => { showLabels = e.target.checked; refresh(); });
  document.getElementById('refreshBtn').addEventListener('click', refresh);
  document.getElementById('resetView').addEventListener('click', resetMapView);
  document.getElementById('colorMode').addEventListener('click', () => {
    colorMode = colorMode === 'cn' ? 'intl' : 'cn';
    updateLegend();
    refresh();
  });
  // 榜单点击：大洲折叠 / 国家聚焦地图
  document.getElementById('list').addEventListener('click', (e) => {
    const h = e.target.closest('.group-head');
    if (h) {
      const rk = h.dataset.region;
      if (collapsed.has(rk)) collapsed.delete(rk); else collapsed.add(rk);
      if (lastData) renderList(lastData);
      return;
    }
    const itemEl = e.target.closest('.item');
    if (itemEl && itemEl.dataset.idx != null) {
      focusCountry(parseInt(itemEl.dataset.idx, 10));
    }
  });
  document.getElementById('toggleAll').addEventListener('click', () => {
    const anyOpen = REGION_ORDER.some(r => !collapsed.has(r));
    collapsed.clear();
    if (anyOpen) REGION_ORDER.forEach(r => collapsed.add(r));
    if (lastData) renderList(lastData);
  });
  document.querySelectorAll('.sort button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.sort button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      sortMode = b.dataset.sort;
      refresh();
    });
  });
  window.addEventListener('resize', () => chart.resize());
}

// 站点主题切换时，让地图背景同步（白色主题 -> 极简浅色）
window.addEventListener('site-theme-change', function () {
  var light = document.documentElement.getAttribute('data-theme') === 'light';
  var t = light ? 'light' : 'midnight';
  var sel = document.getElementById('theme');
  if (sel) sel.value = t;
  applyTheme(t);
});

// ---------- 启动 ----------
(async function main() {
  setupControls();
  updateLegend();
  try {
    await initMap();
  } catch (e) {
    document.getElementById('map').innerHTML =
      '<div style="padding:40px;color:#8aa0bd">地图资源加载失败：' + e.message + '</div>';
    return;
  }
  // 初始背景随站点主题（深色 / 白色）保持一致
  var savedTheme = null;
  try { savedTheme = localStorage.getItem('theme'); } catch (e) {}
  var siteLight = savedTheme === 'light' || document.documentElement.getAttribute('data-theme') === 'light';
  var initialTheme = siteLight ? 'light' : 'midnight';
  var themeSel = document.getElementById('theme');
  if (themeSel) themeSel.value = initialTheme;
  applyTheme(initialTheme);
  await refresh();
})();
