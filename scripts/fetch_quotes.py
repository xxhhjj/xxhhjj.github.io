#!/usr/bin/env python3
"""环球指数地图 · 行情抓取（无服务器版）
抓取新浪财经全球指数行情，写入 data/quotes.json，供前端地图读取。
等价于原 server.js 的 /api/quote，但改为由 GitHub Actions 定时生成静态文件。

新浪 hq.sinajs.cn 必须带 Referer，浏览器端无法设置，故由本脚本（或服务端）代理。
符号清单来自 assets/data/indices.js（window.GLOBAL_INDICES），与前端共用单一数据源。
"""
import json
import re
import sys
import time
import urllib.request
import urllib.error

SINA_URL = "https://hq.sinajs.cn/list={symbols}"
HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://finance.sina.com.cn",
}
INDICES_FILE = "assets/data/indices.js"
OUT = "data/quotes.json"


def load_symbols():
    """从 indices.js 提取所有 sym（正则，避免执行 JS）。"""
    text = open(INDICES_FILE, encoding="utf-8", errors="ignore").read()
    return re.findall(r"sym:\s*'([\w$]+)'", text)


def fetch_text(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.read().decode("gb18030", "ignore")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError) as e:
            if i == tries - 1:
                print(f"[warn] 拉取失败 {url}: {e}", file=sys.stderr)
            else:
                time.sleep(2 ** i)
    return ""


def parse_sina(text):
    """兼容两种新浪字段格式（与 server.js 一致）：
       int_/b_ 类：f[1]=现价, f[2]=涨跌点, f[3]=涨跌幅%
       gb_$ 类 ：f[1]=现价, f[2]=涨跌幅%, f[3]=时间串(含:), f[4]=涨跌点
    """
    quotes = {}
    for m in re.finditer(r'var hq_str_([\w$]+)="([^"]*)";', text):
        sym, body = m.group(1), m.group(2)
        if not body:
            continue
        f = body.split(",")
        if len(f) < 4:
            continue
        try:
            price = float(f[1])
        except ValueError:
            continue
        if re.search(":", f[3] or ""):
            pct = _to_float(f[2])
            change = _to_float(f[4])
        else:
            change = _to_float(f[2])
            pct = _to_float(f[3])
        quotes[sym] = {
            "price": price,
            "change": 0 if change is None else change,
            "changePct": 0 if pct is None else pct,
        }
    return quotes


def _to_float(s):
    if s is None:
        return None
    try:
        return float(str(s).replace("%", ""))
    except ValueError:
        return None


def load_baseline():
    try:
        with open(OUT, encoding="utf-8") as f:
            d = json.load(f)
        return (d.get("quotes") or {}) if isinstance(d, dict) else {}
    except (FileNotFoundError, ValueError):
        return {}


def main():
    syms = load_symbols()
    if not syms:
        print("[err] 未从 indices.js 解析到任何符号", file=sys.stderr)
        return
    print(f"[info] 共 {len(syms)} 个指数符号")

    baseline = load_baseline()
    text = fetch_text(SINA_URL.format(symbols=",".join(syms)))
    live = parse_sina(text) if text else {}

    # 合并：本次拿到优先，否则沿用上次快照（避免波动时空点闪烁）
    quotes = dict(baseline)
    quotes.update(live)

    out = {
        "source": "sina",
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "count": len(quotes),
        "quotes": quotes,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"[ok] 已写入 {OUT}：本次 {len(live)} 条，合计 {len(quotes)} 条")


if __name__ == "__main__":
    main()
