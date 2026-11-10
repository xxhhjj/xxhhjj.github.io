#!/usr/bin/env python3
"""把 Markdown 文章转换为慧眼投网站的独立详情页（无服务器、纯静态）。

特性：
- 支持自定义提示框语法  ::: info 标题 ... 内容 ... :::  （含 :::tip / ::: warning 等变体）
- 支持 GitHub 表格（含单元格内联 HTML：<span>/<br>）、图片、链接、加粗、
  有序列表(1.)与无序列表(-/*)、块引用(>)、分隔线
- 透传原始 HTML 片段（如 <center>/<div> 包裹的二维码）
- 自动复用 index.html 的导航与页脚（改为根相对链接）
- 把文档首行 # 标题 用作页面 H1
- 自动从 ## / ### 副标题生成侧边目录（TOC），并给标题加锚点 id，配合 main.js 滚动高亮

用法：
  python scripts/build_docs.py <输入.md> <输出.html> [--title 自定义标题] [--desc 描述]
"""
import os
import re
import sys

SITE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ---------- 行内转换 ----------
def convert_inline(text):
    # 图片 ![alt](url)
    text = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)',
                  lambda m: '<img src="%s" alt="%s">' % (m.group(2), m.group(1)), text)
    # 链接 [text](url)，外链加 target
    def link_repl(m):
        t, href = m.group(1), m.group(2)
        ext = href.startswith('http')
        attr = ' target="_blank" rel="noopener"' if ext else ''
        return '<a href="%s"%s>%s</a>' % (href, attr, t)
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', link_repl, text)
    # 加粗 **x**
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    # 裸 URL 自动加链接（排除已在 href=" 或 ( 后的）
    text = re.sub(r'(?<!["\'=\)>])(https?://[^\s<]+)',
                  r'<a href="\1" target="_blank" rel="noopener">\1</a>', text)
    return text


# ---------- 表格 ----------
def _split_row(line):
    line = line.strip()
    if line.startswith('|'):
        line = line[1:]
    if line.endswith('|'):
        line = line[:-1]
    return [c.strip() for c in line.split('|')]


def render_table(header, sep, body):
    cols = _split_row(header)
    sep_cells = _split_row(sep)
    aligns = []
    for s in sep_cells:
        if s.startswith(':') and s.endswith(':'):
            aligns.append('center')
        elif s.endswith(':'):
            aligns.append('right')
        elif s.startswith(':'):
            aligns.append('left')
        else:
            aligns.append('')
    thead = '<thead><tr>' + ''.join(
        '<th%s>%s</th>' % ((' style="text-align:%s"' % aligns[i]) if aligns[i] else '',
                           convert_inline(c)) for i, c in enumerate(cols)) + '</tr></thead>'
    tbody = '<tbody>' + ''.join(
        '<tr>' + ''.join(
            '<td%s>%s</td>' % ((' style="text-align:%s"' % aligns[i]) if (i < len(aligns) and aligns[i]) else '',
                               convert_inline(c)) for i, c in enumerate(_split_row(r))) + '</tr>'
        for r in body) + '</tbody>'
    return '<div class="table-wrap"><table>%s%s</table></div>' % (thead, tbody)


# ---------- 块级转换 ----------
def blocks_from_lines(lines):
    html = []
    para = []

    def flush_para():
        if para:
            t = ' '.join(para).strip()
            if t:
                html.append('<p>%s</p>' % convert_inline(t))
            para.clear()

    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        stripped = line.strip()
        if stripped == '':
            flush_para()
            i += 1
            continue
        m = re.match(r'^(#{1,6})\s+(.*)$', line)
        if m:
            flush_para()
            lvl = len(m.group(1))
            html.append('<h%s>%s</h%s>' % (lvl, convert_inline(m.group(2).strip()), lvl))
            i += 1
            continue
        if re.match(r'^-{3,}$', stripped):
            flush_para()
            html.append('<hr>')
            i += 1
            continue
        # 原始 HTML 透传（块级）
        if stripped.startswith('<') and '>' in stripped:
            flush_para()
            html.append(stripped)
            i += 1
            continue
        # 表格
        if '|' in line and i + 1 < n and '-' in lines[i + 1] \
                and re.match(r'^[\s|:\-]+$', lines[i + 1].strip()):
            flush_para()
            header = line
            sep = lines[i + 1]
            j = i + 2
            body = []
            while j < n and '|' in lines[j].strip() and lines[j].strip() != '':
                body.append(lines[j])
                j += 1
            html.append(render_table(header, sep, body))
            i = j
            continue
        # 块引用 >
        if stripped.startswith('>'):
            flush_para()
            buf = []
            while i < n and lines[i].strip().startswith('>'):
                buf.append(re.sub(r'^>\s?', '', lines[i].strip()))
                i += 1
            html.append('<blockquote>%s</blockquote>' % convert_inline(' '.join(buf)))
            continue
        # 列表（有序 1. 与无序 -/* 连续合并为同一种列表）
        if re.match(r'^(\d+\.|\s*[-*])\s+', stripped):
            flush_para()
            items = []
            ordered = None
            while i < n and re.match(r'^(\d+\.|\s*[-*])\s+', lines[i].strip()):
                mm = re.match(r'^(\d+\.|\s*[-*])\s+(.*)$', lines[i].strip())
                marker = mm.group(1)
                is_ordered = bool(re.match(r'\d+\.', marker))
                if ordered is None:
                    ordered = is_ordered
                items.append(mm.group(2).strip())
                i += 1
            tag = 'ol' if ordered else 'ul'
            html.append('<%s>%s</%s>' % (tag, ''.join('<li>%s</li>' % convert_inline(it) for it in items), tag))
            continue
        para.append(stripped)
        i += 1
    flush_para()
    return '\n'.join(html)


def render_callout(title, buf):
    inner = blocks_from_lines(buf)
    out = ['<div class="callout">']
    if title:
        out.append('<div class="callout__title">%s</div>' % convert_inline(title))
    out.append('<div class="callout__body">%s</div>' % inner)
    out.append('</div>')
    return '\n'.join(out)


def md_to_html(md):
    lines = md.split('\n')
    segments = []
    cur = []
    callout_title = None
    callout_buf = None
    i = 0
    n = len(lines)
    while i < n:
        s = lines[i].strip()
        if s.startswith(':::') and callout_buf is None:
            if cur:
                segments.append(('block', cur))
                cur = []
            rest = s[3:].strip()
            # ::: info 标题 / ::: tip 标题 / ::: 标题
            parts = rest.split(' ', 1)
            title = parts[1].strip() if len(parts) > 1 else ''
            callout_title = title
            callout_buf = []
            i += 1
            continue
        if s == ':::' and callout_buf is not None:
            segments.append(('callout', callout_title, callout_buf))
            callout_buf = None
            callout_title = None
            i += 1
            continue
        if callout_buf is not None:
            callout_buf.append(lines[i])
            i += 1
            continue
        cur.append(lines[i])
        i += 1
    if cur:
        segments.append(('block', cur))
    if callout_buf is not None:
        segments.append(('callout', callout_title, callout_buf))

    html = []
    for seg in segments:
        if seg[0] == 'block':
            html.append(blocks_from_lines(seg[1]))
        else:
            html.append(render_callout(seg[1], seg[2]))
    return '\n'.join(html)


def extract_title(md):
    for line in md.split('\n'):
        m = re.match(r'^#\s+(.*)$', line.strip())
        if m:
            return m.group(1).strip()
    return '文章'


# ---------- 标题锚点 + 目录 ----------
def slugify(s):
    s = re.sub(r'<[^>]+>', '', s).strip()
    s = re.sub(r'\s+', '-', s)
    s = re.sub(r'[^\w\-]', '', s, flags=re.UNICODE)
    return s or 'section'


def add_heading_ids_and_toc(body):
    headings = []
    seen = {}

    def repl(m):
        lvl = m.group(1)
        inner = m.group(2)
        text = re.sub(r'<[^>]+>', '', inner).strip()
        base = slugify(text)
        slug = base
        if slug in seen:
            seen[slug] += 1
            slug = '%s-%d' % (base, seen[slug])
        else:
            seen[slug] = 1
        headings.append((lvl, text, slug))
        return '<h%s id="%s">%s</h%s>' % (lvl, slug, inner, lvl)

    new_body = re.sub(r'<h([23])>(.*?)</h\1>', repl, body, flags=re.S)
    return new_body, headings


def build_toc(headings):
    if not headings:
        return ''
    items = []
    for lvl, text, slug in headings:
        cls = 'toc__item toc__item--h%s' % lvl
        items.append('      <li class="%s"><a href="#%s">%s</a></li>' % (cls, slug, text))
    return ('    <nav class="toc" aria-label="目录">\n'
            '      <div class="toc__title">目录</div>\n'
            '      <ul class="toc__list">\n' + '\n'.join(items) + '\n'
            '      </ul>\n'
            '    </nav>')


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        print('用法: python build_docs.py <输入.md> <输出.html> [--title T] [--desc D]')
        sys.exit(1)
    src = args[0]
    out = args[1]
    title = None
    desc = ''
    k = 2
    while k < len(args):
        if args[k] == '--title' and k + 1 < len(args):
            title = args[k + 1]
            k += 2
        elif args[k] == '--desc' and k + 1 < len(args):
            desc = args[k + 1]
            k += 2
        else:
            k += 1

    md = open(src, encoding='utf-8').read()
    doc_title = title or extract_title(md)
    # 去掉首行 H1（页面标题已单独渲染）
    md_body = md
    first = md.split('\n', 1)
    if re.match(r'^#\s+', first[0].strip()):
        md_body = (first[1] if len(first) > 1 else '')

    body = md_to_html(md_body)
    body, headings = add_heading_ids_and_toc(body)
    toc = build_toc(headings)

    # 链接修正：文档内跨页引用 -> 对应详情页/首页区块；图片 -> 资源目录
    body = body.replace('href="/broker/index"', 'href="/broker/"')
    body = body.replace('href="/bank/index"', 'href="/#bank"')
    body = body.replace('href="/service/index"', 'href="/#services"')
    body = body.replace('src="/wechat.png"', 'src="/assets/img/wechat.png"')
    body = body.replace('src="/bank.jpg"', 'src="/assets/img/bank.jpg"')
    body = body.replace('src="/bybit.png"', 'src="/assets/img/bybit.png"')

    # 复用 index.html 的导航与页脚
    index_html = open(os.path.join(SITE_ROOT, 'index.html'), encoding='utf-8').read()
    nav = re.search(r'<header class="nav" id="nav">.*?</header>', index_html, re.S).group(0)
    footer = re.search(r'<footer class="footer">.*?</footer>', index_html, re.S).group(0)
    nav = nav.replace('href="#', 'href="/#').replace('href="#top"', 'href="/"')
    footer = footer.replace('href="#', 'href="/#')

    page = (
        '<!DOCTYPE html>\n'
        '<html lang="zh-CN">\n'
        '<head>\n'
        '  <script>try{var t=localStorage.getItem("theme");if(t==="light")document.documentElement.setAttribute("data-theme","light");}catch(e){}</script>\n'
        '  <meta charset="utf-8" />\n'
        '  <meta name="viewport" content="width=device-width, initial-scale=1" />\n'
        '  <title>@@TITLE@@ | 慧眼投</title>\n'
        '  <meta name="description" content="@@DESC@@" />\n'
        '  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml" />\n'
        '  <link rel="stylesheet" href="/assets/css/style.css" />\n'
        '  <link rel="stylesheet" href="/assets/css/article.css" />\n'
        '</head>\n'
        '<body>\n'
        '@@NAV@@\n'
        '<article class="article">\n'
        '  <div class="article__inner article__doc">\n'
        '    <a class="article__back" href="/">← 返回首页</a>\n'
        '    <span class="eyebrow">慧眼投 · 指南</span>\n'
        '    <h1 class="article__title">@@TITLE@@</h1>\n'
        '  </div>\n'
        '  <div class="article__layout article__inner article__doc">\n'
        '@@TOC@@\n'
        '    <div class="article__main">\n'
        '      <div class="article__body">\n'
        '@@BODY@@\n'
        '      </div>\n'
        '    </div>\n'
        '  </div>\n'
        '</article>\n'
        '@@FOOTER@@\n'
        '<script src="/assets/js/main.js"></script>\n'
        '</body>\n'
        '</html>\n'
    )
    page = (page
            .replace('@@TITLE@@', doc_title)
            .replace('@@DESC@@', desc or doc_title)
            .replace('@@NAV@@', nav)
            .replace('@@TOC@@', toc)
            .replace('@@BODY@@', body)
            .replace('@@FOOTER@@', footer))

    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(page)
    print('[ok] 已生成 %s （标题：%s，正文 %d 字符，目录 %d 项）' % (out, doc_title, len(body), len(headings)))


if __name__ == '__main__':
    main()
