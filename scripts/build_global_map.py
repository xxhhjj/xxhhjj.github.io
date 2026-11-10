#!/usr/bin/env python3
"""把首页的「环球指数地图」抽成独立页面 /global/（由导航「全球指数」进入）。

做法：
- 从 index.html 提取导航与页脚（改为根相对链接，并把 #market 映射到 /global/）
- 提取首页 #market 区块里的 .gim 容器（地图本体）
- 生成 global/index.html，并顺手把首页的 #market 区块删除、导航/页脚 #market 链接改指 /global/

注意：#market 区块内部嵌套了 <section id="map" class="map"></section>，
因此删除时必须按 <section>/</section> 配平，不能用非贪婪 .*?</section>。
可重复运行（已处理过的文件会安全跳过对应步骤）。
"""
import os
import re

SITE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def fix_links(s):
    s = s.replace('href="#top"', 'href="/"')
    s = s.replace('href="#market"', 'href="/global/"')
    s = s.replace('href="#', 'href="/#')
    return s


def extract_balanced_tag(html, start_marker, open_re, close_re):
    """从 start_marker 位置起，按 open_re/close_re 配平提取第一个完整块（含起止标签）。"""
    start = html.index(start_marker)
    depth = 0
    i = start
    n = len(html)
    while i < n:
        mo = re.match(open_re, html[i:])
        if mo:
            depth += 1
            i += mo.end()
            continue
        mc = re.match(close_re, html[i:])
        if mc:
            depth -= 1
            i += mc.end()
            if depth == 0:
                return html[start:i]
            continue
        i += 1
    return html[start:]


def main():
    src = os.path.join(SITE_ROOT, 'index.html')
    html = open(src, encoding='utf-8').read()

    nav = re.search(r'<header class="nav" id="nav">.*?</header>', html, re.S).group(0)
    footer = re.search(r'<footer class="footer">.*?</footer>', html, re.S).group(0)
    nav = fix_links(nav)
    footer = fix_links(footer)

    # 生成 /global/ 独立页（仅当首页还存在 .gim 时提取；否则跳过，保留已有页面）
    if '<div class="gim">' in html:
        gim = extract_balanced_tag(
            html, '<div class="gim">',
            r'<div[\s>]', r'</div>',
        )
        page = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <script>try{var t=localStorage.getItem("theme");if(t==="light")document.documentElement.setAttribute("data-theme","light");}catch(e){}</script>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>环球指数地图 | 慧眼投</title>
  <meta name="description" content="在透明世界地图上实时叠加全球主要股市指数，数据每 4 小时由 GitHub Actions 自动更新。" />
  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/assets/css/style.css" />
  <link rel="stylesheet" href="/assets/css/map.css" />
</head>
<body>
{nav}
<main class="gim-page">
  <div class="gim-page__inner">
    <a class="article__back" href="/">← 返回首页</a>
    {gim}
  </div>
</main>
{footer}
<script src="/assets/lib/echarts.min.js"></script>
<script src="/assets/data/world.js"></script>
<script src="/assets/data/indices.js"></script>
<script src="/assets/js/map-app.js"></script>
<script src="/assets/js/main.js"></script>
</body>
</html>
""".format(nav=nav, gim=gim, footer=footer)

        out_dir = os.path.join(SITE_ROOT, 'global')
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(page)
        print('[ok] 已生成 global/index.html（地图本体 %d 字符）' % len(gim))
    else:
        print('[skip] 首页已无 .gim 容器，跳过 global/index.html 重建（保留现有页面）')

    # 回写：移除首页 #market 区块（按 section 配平，避免被内部 <section id="map"> 截断）
    if re.search(r'<section class="section" id="market"[^>]*>', html, re.S):
        block = extract_balanced_tag(
            html, '<section class="section" id="market"',
            r'<section[\s>]', r'</section>',
        )
        html2 = html.replace(block, '')
        html2 = re.sub(r'\n{3,}', '\n\n', html2)
        with open(src, 'w', encoding='utf-8') as f:
            f.write(html2)
        print('[ok] 已更新 index.html：移除 #market 区块')
    else:
        print('[skip] 首页已无 #market 区块，跳过删除')

    # 导航/页脚 #market 链接改指 /global/（无论上面是否操作都确保一次）
    html_now = open(src, encoding='utf-8').read()
    if 'href="#market">全球指数' in html_now:
        html_now = html_now.replace('href="#market">全球指数', 'href="/global/">全球指数')
        with open(src, 'w', encoding='utf-8') as f:
            f.write(html_now)
        print('[ok] 导航/页脚「全球指数」→ /global/')
    else:
        print('[skip] 导航/页脚「全球指数」已指向 /global/')


if __name__ == '__main__':
    main()
