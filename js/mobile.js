/* ============================================================
 * mobile.js — iPhone/mobile enhancements: touch ripple,
 * pull-to-refresh, iOS input fixes, safe-area handling.
 * Namespace: window.Mobile
 * ============================================================ */
(function (global) {
  'use strict';
  var Mobile = {};

  Mobile.init = function () {
    Mobile.ripple();
    Mobile.pullToRefresh();
    Mobile.preventZoomOnDoubleTap();
    Mobile.fixIOSInputs();
    Mobile.safeAreas();
  };

  // Touch ripple feedback on buttons/nav items
  Mobile.ripple = function () {
    document.addEventListener('touchstart', function (e) {
      var el = e.target.closest ? e.target.closest('.btn, .nav-link, .bottom-nav .nav-item') : null;
      if (!el) return;
      var rect = el.getBoundingClientRect();
      var span = document.createElement('span');
      span.className = 'ripple';
      var size = Math.max(rect.width, rect.height);
      span.style.width = span.style.height = size + 'px';
      span.style.left = (e.touches[0].clientX - rect.left - size / 2) + 'px';
      span.style.top = (e.touches[0].clientY - rect.top - size / 2) + 'px';
      el.appendChild(span);
      setTimeout(function () { span.remove(); }, 600);
    }, { passive: true });
  };

  // Pull-to-refresh on the content area (mobile)
  Mobile.pullToRefresh = function () {
    var content = document.querySelector('.content');
    if (!content || !('ontouchstart' in window)) return;
    var startY = 0, pulling = false;
    content.addEventListener('touchstart', function (e) {
      startY = e.touches[0].clientY;
      pulling = content.scrollTop <= 0;
    }, { passive: true });
    content.addEventListener('touchmove', function (e) {
      if (!pulling || content.scrollTop > 0) return;
      var dy = e.touches[0].clientY - startY;
      if (dy > 0 && dy < 120) {
        content.style.transform = 'translateY(' + (dy * 0.35) + 'px)';
        content.style.transition = 'none';
      }
    }, { passive: true });
    content.addEventListener('touchend', function () {
      if (content.style.transform) {
        content.style.transform = '';
        content.style.transition = 'transform .3s';
        // refresh current view data
        if (global.App) global.App.refreshCurrentView();
      }
    }, { passive: true });
  };

  // Prevent iOS double-tap zoom on interactive elements
  Mobile.preventZoomOnDoubleTap = function () {
    document.addEventListener('touchend', function (e) {
      if (e.target.closest && e.target.closest('button, a, input, select, .btn, .nav-link')) {
        var now = Date.now();
        if (now - (global.__lastTap || 0) < 350) {
          e.preventDefault();
        }
        global.__lastTap = now;
      }
    }, { passive: false });
  };

  // iOS zooms into inputs with font-size < 16px — bump them
  Mobile.fixIOSInputs = function () {
    if (!/iPhone|iPad|iPod/.test(navigator.userAgent || '')) return;
    var style = document.createElement('style');
    style.textContent = 'input, select, textarea { font-size: 16px !important; }';
    document.head.appendChild(style);
  };

  // Apply safe-area paddings
  Mobile.safeAreas = function () {
    var bottomNav = document.getElementById('bottomNav');
    if (bottomNav) bottomNav.classList.add('safe-area-bottom');
    var topbar = document.querySelector('.topbar');
    if (topbar) topbar.classList.add('safe-area-top');
  };

  global.Mobile = Mobile;
})(typeof window !== 'undefined' ? window : globalThis);
