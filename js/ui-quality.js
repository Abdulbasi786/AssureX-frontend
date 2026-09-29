/* Progressive accessibility without a network dependency. */
(function () {
  'use strict';
  function boot() {
    var main = document.querySelector('main, .app-main, #landingView, .auth-card, .wrap');
    if (main) {
      if (!main.id) main.id = 'main-content';
      main.setAttribute('tabindex', '-1');
      var skip = document.createElement('a');
      skip.className = 'skip-content'; skip.href = '#' + main.id;
      skip.textContent = 'Skip to content'; document.body.prepend(skip);
    }
    document.querySelectorAll('input,select,textarea').forEach(function (input) {
      if (input.type === 'hidden' || input.hasAttribute('aria-label') || input.hasAttribute('aria-labelledby') || input.labels && input.labels.length) return;
      var label = input.placeholder || input.name || input.id;
      if (label) input.setAttribute('aria-label', label.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' '));
    });
    [['sidebarToggle','Open navigation'],['closeSidebar','Close navigation'],['closeTheme','Close appearance settings']].forEach(function (item) {
      var el = document.getElementById(item[0]); if (el) el.setAttribute('aria-label', item[1]);
    });
    var sidebar = document.getElementById('sidebar'), toggle = document.getElementById('sidebarToggle');
    if (sidebar && toggle) {
      toggle.setAttribute('aria-controls', sidebar.id);
      function sync() { toggle.setAttribute('aria-expanded', String(sidebar.classList.contains('open'))); }
      new MutationObserver(sync).observe(sidebar, { attributes: true, attributeFilter: ['class'] }); sync();
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && sidebar.classList.contains('open')) { sidebar.classList.remove('open'); toggle.focus(); }
      });
      document.addEventListener('click', function (event) {
        if (sidebar.classList.contains('open') && !sidebar.contains(event.target) && !toggle.contains(event.target)) sidebar.classList.remove('open');
      });
    }
    document.querySelectorAll('.toast, [id$="Status"]').forEach(function (el) { if (!el.hasAttribute('aria-live')) el.setAttribute('aria-live', 'polite'); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
