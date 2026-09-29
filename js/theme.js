/* AssureX global light/dark theme controller.  Dark is the default. */
(function () {
  'use strict';

  var KEY = 'assurexTheme';
  var root = document.documentElement;
  var stored = localStorage.getItem(KEY);
  var theme = stored === 'light' ? 'light' : 'dark';

  root.setAttribute('data-assurex-theme', theme);
  root.classList.toggle('assurex-light', theme === 'light');
  root.classList.toggle('assurex-dark', theme === 'dark');

  function logoPath(kind, mode) {
    if (kind === 'fav') {
      return mode === 'light' ? 'asset/assurex-x-light.png' : 'asset/assurex-x-dark.png';
    }
    return mode === 'light' ? 'asset/assurex-logo-light.png' : 'asset/assurex-logo-dark.png';
  }

  function apply(themeName, persist) {
    themeName = themeName === 'light' ? 'light' : 'dark';
    theme = themeName;

    root.setAttribute('data-assurex-theme', themeName);
    root.classList.toggle('assurex-light', themeName === 'light');
    root.classList.toggle('assurex-dark', themeName === 'dark');
    document.body && document.body.classList.remove('theme-light', 'theme-dark');
    document.body && document.body.classList.add('theme-' + themeName);

    if (persist !== false) localStorage.setItem(KEY, themeName);

    document.querySelectorAll('[data-assurex-logo]').forEach(function (img) {
      var kind = img.getAttribute('data-assurex-logo') || 'icon';
      img.src = logoPath(kind, themeName);
    });

    var toggle = document.getElementById('assurexThemeToggle');
    if (toggle) {
      var next = themeName === 'dark' ? 'light' : 'dark';
      toggle.dataset.mode = themeName;
      toggle.setAttribute('aria-label', 'Switch to ' + next + ' mode');
      toggle.setAttribute('title', 'Switch to ' + next + ' mode');
      toggle.querySelector('.theme-toggle-label')?.replaceChildren(document.createTextNode(next === 'light' ? 'Light' : 'Dark'));
      toggle.querySelector('.theme-sun')?.classList.toggle('active', themeName === 'light');
      toggle.querySelector('.theme-moon')?.classList.toggle('active', themeName === 'dark');
    }

    var current = document.getElementById('currentTheme');
    if (current) current.textContent = themeName === 'light' ? 'Light Mode' : 'Dark Mode';

    document.querySelectorAll('.theme-choice').forEach(function (choice) {
      choice.classList.toggle('active', choice.dataset.theme === themeName);
      choice.setAttribute('aria-checked', choice.dataset.theme === themeName ? 'true' : 'false');
    });

    var favicon = document.querySelector('link[rel*="icon"]');
    if (favicon) favicon.href = logoPath('fav', themeName);

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', themeName === 'light' ? '#f5f8ff' : '#060912');

    window.dispatchEvent(new CustomEvent('assurex-theme-change', { detail: { theme: themeName } }));
  }

  function addStandaloneBrand() {
    var hasBrand = document.querySelector('.landing-logo, .dashboard-brand, .auth-brand, a.brand');
    if (hasBrand || document.querySelector('.assurex-page-brand')) return;

    var brand = document.createElement('a');
    brand.className = 'assurex-page-brand';
    brand.href = 'index.html';
    brand.innerHTML = '<img data-assurex-logo="icon" alt="AssureX">';
    document.body.appendChild(brand);
  }

  function addToggle() {
    if (document.getElementById('assurexThemeToggle')) {
      apply(theme, false);
      return;
    }

    var button = document.createElement('button');
    button.type = 'button';
    button.id = 'assurexThemeToggle';
    button.className = 'assurex-theme-toggle';
    button.innerHTML = '<span class="theme-icon theme-moon" aria-hidden="true">☾</span><span class="theme-icon theme-sun" aria-hidden="true">☀</span><span class="theme-toggle-label">Light</span>';
    button.addEventListener('click', function () {
      apply(theme === 'dark' ? 'light' : 'dark');
    });
    document.body.appendChild(button);
    apply(theme, false);
  }

  function markExistingLogos() {
    document.querySelectorAll('.auth-logo').forEach(function (img) {
      img.setAttribute('data-assurex-logo', 'icon');
    });
    document.querySelectorAll('.landing-logo img, .dashboard-brand img').forEach(function (img) {
      img.setAttribute('data-assurex-logo', 'icon');
    });
    document.querySelectorAll('.brand img, .brand-logo img').forEach(function (img) {
      img.setAttribute('data-assurex-logo', 'icon');
    });

    // Standalone pages use text-only brand links. Add the supplied X mark without
    // changing their existing navigation or page structure.
    document.querySelectorAll('a.brand').forEach(function (brand) {
      if (!brand.querySelector('.brand-mark')) {
        var mark = document.createElement('img');
        mark.className = 'brand-mark';
        mark.alt = '';
        mark.setAttribute('aria-hidden', 'true');
        mark.setAttribute('data-assurex-logo', 'icon');
        brand.prepend(mark);
      }
    });

    document.querySelectorAll('img[alt="AssureX"]').forEach(function (img) {
      if (!img.hasAttribute('data-assurex-logo')) {
        img.setAttribute('data-assurex-logo', 'icon');
      }
    });
  }

  try { if (/(^|\/)(index\.html)?$/.test(location.pathname) && !sessionStorage.getItem('axSplash')) void 0; } catch (e) {}
  root.classList.add('assurex-theme-ready');

  document.addEventListener('DOMContentLoaded', function () {
    markExistingLogos();
    addStandaloneBrand();
    addToggle();
  });


  /* ---- Redesign v2 motion helpers ------------------------------------ */
  function initMotion() {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { root.classList.remove('ax-splashing'); return; }

    // One-time logo reveal on the landing page (once per browser session).
    var isLanding = !!document.getElementById('landingView');
    try {
      if (false) {
        sessionStorage.setItem('axSplash', '1');
        var splash = document.createElement('div');
        splash.className = 'ax-splash';
        splash.setAttribute('aria-hidden', 'true');
        splash.innerHTML = '<img alt="" src="' + logoPath('icon', theme) + '">';
        document.body.appendChild(splash);
        setTimeout(function () { root.classList.remove('ax-splashing'); }, 1100);
        setTimeout(function () { splash.remove(); }, 2100);
      }
    } catch (e) {}

    // Soft light that follows the pointer (desktop only).
    if (false) {
      var glow = document.createElement('div');
      glow.className = 'ax-cursor-glow';
      document.body.appendChild(glow);
      var tx = 0, ty = 0, x = 0, y = 0, raf = null;
      var tick = function () {
        x += (tx - x) * 0.12; y += (ty - y) * 0.12;
        glow.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
        raf = (Math.abs(tx - x) + Math.abs(ty - y) > 0.5) ? requestAnimationFrame(tick) : null;
      };
      window.addEventListener('pointermove', function (e) {
        tx = e.clientX; ty = e.clientY; glow.classList.add('on');
        if (!raf) raf = requestAnimationFrame(tick);
      }, { passive: true });
      document.addEventListener('pointerleave', function () { glow.classList.remove('on'); });
    }

    // Landing navbar gains depth once the page is scrolled.
    var nav = document.querySelector('.landing-navbar');
    if (nav) {
      var onScroll = function () { nav.classList.toggle('is-scrolled', window.scrollY > 24); };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }
  document.addEventListener('DOMContentLoaded', initMotion);

  window.AssureXTheme = {
    get: function () { return theme; },
    set: function (next) { apply(next); },
    toggle: function () { apply(theme === 'dark' ? 'light' : 'dark'); }
  };
})();
