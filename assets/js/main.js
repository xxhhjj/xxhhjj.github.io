/* 慧眼投 · 页面交互 */

/* 深色 / 白色背景 主题切换（持久化到 localStorage，并通知地图页同步） */
(function () {
  "use strict";
  var root = document.documentElement;
  var btn = document.getElementById("themeToggle");
  function syncIcon() {
    if (!btn) return;
    btn.textContent = root.getAttribute("data-theme") === "light" ? "🌙" : "☀️";
  }
  syncIcon();
  if (btn) {
    btn.addEventListener("click", function () {
      var light = root.getAttribute("data-theme") === "light";
      if (light) {
        root.removeAttribute("data-theme");
        try { localStorage.setItem("theme", "dark"); } catch (e) {}
      } else {
        root.setAttribute("data-theme", "light");
        try { localStorage.setItem("theme", "light"); } catch (e) {}
      }
      syncIcon();
      window.dispatchEvent(new Event("site-theme-change"));
    });
  }
})();

(function () {
  "use strict";

  // 移动端菜单
  var toggle = document.getElementById("navToggle");
  var links = document.querySelector(".nav__links");
  if (toggle && links) {
    toggle.addEventListener("click", function () { links.classList.toggle("open"); });
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () { links.classList.remove("open"); });
    });
  }

  // 导航滚动阴影
  var nav = document.getElementById("nav");
  if (nav) {
    window.addEventListener("scroll", function () {
      if (window.scrollY > 8) nav.style.boxShadow = "0 8px 30px rgba(0,0,0,.35)";
      else nav.style.boxShadow = "none";
    }, { passive: true });
  }

  // 滚动揭示动画
  var revealEls = document.querySelectorAll(".section, .detail, .card, .feature");
  revealEls.forEach(function (el) { el.classList.add("reveal"); });
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }
})();

/* 详情页目录滚动高亮（仅当页面存在 .toc 时生效） */
(function () {
  "use strict";
  var toc = document.querySelector(".toc");
  if (!toc) return;
  var links = Array.prototype.slice.call(toc.querySelectorAll("a"));
  if (!links.length) return;

  var map = {};
  var targets = [];
  links.forEach(function (a) {
    var id = a.getAttribute("href").slice(1);
    var el = document.getElementById(id);
    if (el) { map[id] = a; targets.push(el); }
  });
  if (!targets.length) return;

  function onScroll() {
    var pos = window.scrollY + 120;
    var current = null;
    targets.forEach(function (el) {
      if (el.offsetTop <= pos) current = el.id;
    });
    links.forEach(function (a) { a.classList.remove("active"); });
    if (current && map[current]) map[current].classList.add("active");
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();
