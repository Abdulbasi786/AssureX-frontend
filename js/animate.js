/* AssureX — light GSAP layer: a short entrance for a few boxes, nothing continuous. */
(function () {
  'use strict';
  if (!window.gsap || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var BOX = '.stat-card,.feature-card,.solution-card,.use-case,.about-card,.policy-card,.intelligence-card,.document-card,.model-card,.metric,.section-heading,.workflow-step,.cta-card,.reveal';
  var SKIP = '.hero-content,.hero-visual,.ocr-modal,#addProductModal,#mlWorkspace';
  var CLEAR = 'transform,opacity,visibility', n = 0, MAX = 40;
  var io = new IntersectionObserver(function (es) {
    var a = [];
    es.forEach(function (e) { if (e.isIntersecting) { a.push(e.target); io.unobserve(e.target); } });
    if (a.length) gsap.to(a, { autoAlpha: 1, y: 0, duration: .45, ease: 'power2.out', stagger: .04, overwrite: 'auto', clearProps: CLEAR });
  }, { rootMargin: '0px 0px -3% 0px' });
  function prep(el) {
    if (el._ax || n >= MAX || el.closest(SKIP)) return;
    el._ax = 1; n++; el.classList.remove('reveal');
    gsap.set(el, { autoAlpha: 0, y: 22 }); io.observe(el);
  }
  function boot() {
    document.querySelectorAll(BOX).forEach(prep);
    gsap.from('.sidebar-nav > *', { x: -16, autoAlpha: 0, duration: .4, stagger: .03, clearProps: CLEAR });
    gsap.from('.page-heading > *', { y: 14, autoAlpha: 0, duration: .4, stagger: .06, clearProps: CLEAR });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
