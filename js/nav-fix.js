/*
 * AssureX shared navigation / logout / search helper.
 * Loaded on every page that has the sidebar, so behaviour is identical everywhere
 * (previously it lived only in app.js, which many pages do not load).
 */
(function () {
  'use strict';

  var PAGES = {
    dashboard: 'dashboard.html',
    products: 'products.html',
    warranties: 'warranties.html',
    documents: 'documents.html',
    claims: 'claims.html',
    validation: 'validation.html',
    evaluation: 'evaluation.html',
    decision: 'decision.html',
    analytics: 'analytics.html',
    readiness: 'readiness.html',
    profile: 'profile.html',
    admin: 'admin.html',
    'repair-history':'repair-history.html',
    'warranty-policies':'warranty-policies.html'
  };

  // Files that belong to a nav section even though the filename differs.
  var ALIAS = {
    'claim.html': 'claims',
    'add-product.html': 'products',
    'products-single-page.html': 'products',
    'product.html': 'products',
    'repair-history.html': 'repair-history',
    'warranty-policies.html': 'warranty-policies'
  };

  function currentPage() {
    var f = (location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();
    if (ALIAS[f]) return ALIAS[f];
    for (var k in PAGES) if (PAGES[k] === f) return k;
    return 'dashboard';
  }

  /* ---------- active state ---------- */
  function markActive() {
    var cur = currentPage();
    document.querySelectorAll('.nav-item[data-page]').forEach(function (el) {
      var on = el.dataset.page === cur;
      el.classList.toggle('active', on);
      if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
  }

  /* ---------- logout ---------- */
  var loggingOut = false;
  async function logout(btn) {
    if (loggingOut) return;
    loggingOut = true;
    var label = btn && btn.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Signing out…'; }

    var run = (async function () {
      try {
        if (window.AuthService && typeof AuthService.signOut === 'function') {
          await AuthService.signOut();
          return;
        }
      } catch (e) { console.warn('[AssureX] AuthService.signOut failed, falling back', e); }
      try {
        if (window.fbAuth) await window.fbAuth.signOut();
        else if (window.firebase && firebase.auth) await firebase.auth().signOut();
      } catch (e) { console.error('[AssureX] signOut failed', e); }
    })();

    // Never let a slow network keep the user stuck on the page.
    await Promise.race([run, new Promise(function (r) { setTimeout(r, 3000); })]);

    try {
      sessionStorage.removeItem('assurex-role');
      sessionStorage.clear();
    } catch (e) { /* ignore */ }

    if (btn) { btn.textContent = label; }
    location.replace('login.html');
  }

  /* ---------- delegated clicks (capture => runs before page scripts) ---------- */
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;

    var out = t.closest('#logout, .logout-button');
    if (out) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      logout(out);
      return;
    }

    var nav = t.closest('.nav-item[data-page]');
    if (nav) {
      var page = nav.dataset.page;
      var url = PAGES[page];
      if (!url) return;                       // unknown item: leave to page scripts
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (typeof window.AssureXCan === 'function' && !window.AssureXCan(page)) {
        location.href = 'dashboard.html';
        return;
      }
      var sb = document.getElementById('sidebar');
      if (sb) sb.classList.remove('open');
      if (page !== currentPage() || (location.pathname.split('/').pop() || '').toLowerCase() !== url) {
        location.href = url;
      }
      return;
    }

    if (t.closest('#sidebarToggle')) {
      ev.stopImmediatePropagation();
      var s1 = document.getElementById('sidebar'); if (s1) s1.classList.add('open');
      return;
    }
    if (t.closest('#closeSidebar')) {
      ev.stopImmediatePropagation();
      var s2 = document.getElementById('sidebar'); if (s2) s2.classList.remove('open');
    }
  }, true);

  /* ---------- search bar: svg icon + "/" shortcut ---------- */
  var SEARCH_SVG =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/>' +
    '<path d="M20 20l-3.6-3.6"/></svg>';

  function enhanceSearch() {
    document.querySelectorAll('.global-search').forEach(function (box) {
      var icon = box.querySelector(':scope > span');
      if (icon && !icon.querySelector('svg')) { icon.innerHTML = SEARCH_SVG; icon.classList.add('gs-icon'); }
      var kbd = box.querySelector('kbd');
      if (kbd) {
        var mac = /Mac|iPhone|iPad/i.test(navigator.platform || '');
        kbd.textContent = mac ? '⌘ K' : 'Ctrl K';
      }
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var a = document.activeElement;
    if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
    var inp = document.getElementById('globalSearch');
    if (inp) { e.preventDefault(); inp.focus(); }
  });

  function init() { markActive(); enhanceSearch(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
