/* AssureX landing interactions and GSAP motion. No live account data is accessed. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const header = $('.ax-header');
  const menu = $('#axMobileNav');
  const menuButton = $('.ax-menu-toggle');
  const themeButton = $('#assurexThemeToggle');
  if (themeButton) $('#axThemeSlot').appendChild(themeButton);
  // theme.js initializes on DOMContentLoaded; this defer script may run before it.
  document.addEventListener('DOMContentLoaded', () => {
    const toggle = $('#assurexThemeToggle');
    if (toggle) $('#axThemeSlot').appendChild(toggle);
  }, { once:true });
  function closeMenu(returnFocus) {
    menu.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Open navigation');
    if (returnFocus) menuButton.focus();
  }
  menuButton.addEventListener('click', () => {
    if (!menu.hidden) { closeMenu(false); return; }
    menu.hidden = false;
    menuButton.setAttribute('aria-expanded', 'true');
    menuButton.setAttribute('aria-label', 'Close navigation');
    if (window.gsap && !reduced.matches) gsap.fromTo(menu, { y:-8, opacity:0 }, { y:0, opacity:1, duration:.2, clearProps:'transform,opacity' });
  });
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => closeMenu(false)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) closeMenu(true); });
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target) && !menuButton.contains(e.target)) closeMenu(false); });
  const mobile = matchMedia('(max-width: 900px)');
  mobile.addEventListener('change', e => { if (!e.matches) closeMenu(false); });
  function onScroll() { header.classList.toggle('is-scrolled', scrollY > 20); }
  window.addEventListener('scroll', onScroll, { passive:true }); onScroll();

  const demo = [
    { title:'Evidence ready', description:'The right documents.<br>Connected to the right claim.', labels:['Purchase receipt','Warranty card','Product evidence'], values:['Attached','Attached','Linked'] },
    { title:'Signals connected', description:'Coverage, dates and details.<br>Checked in context.', labels:['Coverage period','Serial number','Supporting documents'], values:['Within term','Matched','Complete'] },
    { title:'Ready for review', description:'A complete picture.<br>A person makes the final call.', labels:['Evidence summary','Model comparison','Reviewer decision'], values:['Prepared','Available','Pending'] }
  ];
  $$('.ax-demo-steps button').forEach(button => button.addEventListener('click', () => {
    const index = Number(button.dataset.demoStep), state = demo[index];
    $$('.ax-demo-steps button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    $$('[data-check-label]').forEach((el, i) => { el.textContent = state.labels[i]; });
    $$('[data-check-value]').forEach((el, i) => { el.textContent = state.values[i]; });
    $('#demoTitle').textContent = state.title;
    $('#demoDescription').innerHTML = state.description;
    $('#demoProgress').innerHTML = '0' + (index + 1) + '<small>OF 03 STEPS</small>';
    if (window.gsap && !reduced.matches) {
      gsap.to('.ax-ring-fill', { strokeDashoffset:308 * (1 - (index + 1) / 3), duration:.65, ease:'power3.out', overwrite:true });
      gsap.fromTo('.ax-demo-checks > div', { y:8, opacity:.35 }, { y:0, opacity:1, stagger:.06, duration:.35, clearProps:'transform,opacity', overwrite:true });
    } else $('.ax-ring-fill').style.strokeDashoffset = 308 * (1 - (index + 1) / 3);
  }));

  const roles = {
    owners:{ eyebrow:'FOR PRODUCT OWNERS', title:'Less digging.<br>More peace of mind.', text:'Keep product details and purchase documents in one place. Submit a claim with the right evidence and follow its progress.', mini:'Your products. Your records.', miniText:'Everything you need for the next claim.', avatar:'YOU', link:'Create your account', href:'register.html' },
    reviewers:{ eyebrow:'FOR REVIEWERS', title:'More context.<br>Better judgment.', text:'Inspect claim evidence, compare model outputs and check the relevant warranty rules. Record your decision with the reasoning behind it.', mini:'The full review context.', miniText:'Evidence and insights, side by side.', avatar:'REV', link:'Open your review workspace', href:'login.html' },
    admins:{ eyebrow:'FOR ADMINISTRATORS', title:'Keep your team<br>on the same page.', text:'Manage accounts and policies, inspect operational records and monitor claim activity. Give your team the right access to do their work.', mini:'A connected operation.', miniText:'People, policies and activity in view.', avatar:'ADM', link:'Log in to your workspace', href:'login.html' }
  };
  const tabs = $$('.ax-role-tabs button');
  function selectRole(button) {
    const state = roles[button.dataset.roleTab];
    tabs.forEach(b => { b.setAttribute('aria-selected', String(b === button)); b.tabIndex = b === button ? 0 : -1; });
    $('#rolePanel').setAttribute('aria-labelledby', button.id);
    $('#roleEyebrow').textContent = state.eyebrow;
    $('#roleTitle').innerHTML = state.title;
    $('#roleText').textContent = state.text;
    $('#roleMiniTitle').textContent = state.mini;
    $('#roleMiniText').textContent = state.miniText;
    $('#roleAvatar').textContent = state.avatar;
    $('#roleLink').href = state.href;
    $('#roleLink').firstChild.textContent = state.link + ' ';
    if (window.gsap && !reduced.matches) gsap.fromTo('#rolePanel > div', { y:10, opacity:.4 }, { y:0, opacity:1, duration:.35, stagger:.07, clearProps:'transform,opacity', overwrite:true });
  }
  tabs.forEach((button, i) => {
    button.addEventListener('click', () => selectRole(button));
    button.addEventListener('keydown', e => {
      let index;
      if (e.key === 'ArrowRight') index = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') index = (i + tabs.length - 1) % tabs.length;
      else if (e.key === 'Home') index = 0;
      else if (e.key === 'End') index = tabs.length - 1;
      else return;
      e.preventDefault(); tabs[index].focus(); selectRole(tabs[index]);
    });
  });
  $$('.ax-faq-list details').forEach(details => details.addEventListener('toggle', () => {
    if (details.open) $$('.ax-faq-list details').forEach(other => { if (other !== details) other.open = false; });
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }));
  if ('IntersectionObserver' in window) {
    const navObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) $$('.ax-desktop-nav a').forEach(a => a.classList.toggle('active', a.hash === '#' + entry.target.id));
    }), { rootMargin:'-15% 0px -60% 0px' });
    ['how-it-works','features','ai-engine','faq'].forEach(id => navObserver.observe(document.getElementById(id)));
    const flowObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) $$('[data-flow-node]').forEach(node => node.classList.toggle('is-active', node.dataset.flowNode === entry.target.dataset.flowStep));
    }), { rootMargin:'-20% 0px -30% 0px' });
    $$('[data-flow-step]').forEach(el => flowObserver.observe(el));
  }

  // All content is visible by default. Missing GSAP never blocks navigation or reading.
  if (!window.gsap || !window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);
  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const intro = gsap.timeline({ defaults:{ ease:'power3.out' } });
    intro.from('.ax-header', { y:-20, opacity:0, duration:.7, clearProps:'transform,opacity' })
      .from('.ax-badge', { y:18, opacity:0, duration:.65, clearProps:'transform,opacity' }, .1)
      .from('.ax-line > span', { yPercent:115, rotate:2, duration:1.15, stagger:.13, clearProps:'transform' }, .18)
      .from('.ax-hero-description,.ax-hero-actions,.ax-hero-notes', { y:20, opacity:0, duration:.7, stagger:.1, clearProps:'transform,opacity' }, .6)
      .from('.ax-console', { y:65, opacity:0, rotateX:10, scale:.96, duration:1.1, clearProps:'transform,opacity' }, .55)
      .from('.ax-orbit-chip', { y:30, opacity:0, duration:.8, stagger:.12, clearProps:'opacity' }, 1);
    gsap.to('.ax-reading-progress', { scaleX:1, ease:'none', scrollTrigger:{ trigger:document.documentElement, start:'top top', end:'bottom bottom', scrub:.2 } });
    $$('[data-reveal]').forEach(el => gsap.from(el, { y:42, opacity:0, duration:.8, ease:'power3.out', clearProps:'transform,opacity', scrollTrigger:{ trigger:el, start:'top 91%', once:true } }));
    $$('.ax-chapter').forEach(el => gsap.from(el.children, { y:25, opacity:0, duration:.65, stagger:.08, clearProps:'transform,opacity', scrollTrigger:{ trigger:el, start:'top 85%', once:true } }));
    gsap.from('.ax-paper-front', { y:35, rotation:-18, duration:1.2, ease:'power3.out', scrollTrigger:{ trigger:'.ax-paper-scene',start:'top 88%',once:true } });
    gsap.from('.ax-paper-back', { x:-15, rotation:-5, duration:1.2, ease:'power3.out', scrollTrigger:{ trigger:'.ax-paper-scene',start:'top 88%',once:true } });
    $$('.ax-model-connectors path').forEach(path => {
      const length = path.getTotalLength();
      gsap.fromTo(path, { strokeDasharray:length, strokeDashoffset:length }, { strokeDashoffset:0, duration:1.6, ease:'power2.inOut', scrollTrigger:{ trigger:'.ax-model-art',start:'top 80%',once:true } });
    });
    gsap.from('.ax-model', { y:25, opacity:0, duration:.8, stagger:.2, clearProps:'transform,opacity',scrollTrigger:{ trigger:'.ax-model-art',start:'top 85%',once:true } });
    gsap.from('.ax-review-core', { scale:.75, opacity:0, duration:.9, ease:'back.out(1.4)', clearProps:'scale,opacity', scrollTrigger:{ trigger:'.ax-model-art',start:'top 65%',once:true } });
    gsap.from('.ax-final-cta > :not(.ax-cta-lines)', { y:28, opacity:0, duration:.85, stagger:.1, clearProps:'transform,opacity',scrollTrigger:{ trigger:'.ax-final-cta',start:'top 80%',once:true } });

    const desktopMotion = gsap.matchMedia();
    desktopMotion.add('(min-width: 901px) and (hover: hover)', () => {
      gsap.fromTo('.ax-console-scene', { rotateX:5, scale:.97 }, { rotateX:0, scale:1, ease:'none', scrollTrigger:{ trigger:'.ax-console-scene',start:'top 85%',end:'top 20%',scrub:1 } });
      gsap.to('.ax-aurora-one', { y:140, x:60, ease:'none',scrollTrigger:{ trigger:'.ax-hero',start:'top top',end:'bottom top',scrub:1.2 } });
      gsap.to('.ax-orbit-left', { y:-28, rotation:-2, ease:'none',scrollTrigger:{ trigger:'.ax-console-scene',start:'top bottom',end:'bottom top',scrub:1 } });
      gsap.to('.ax-orbit-right', { y:32, rotation:2, ease:'none',scrollTrigger:{ trigger:'.ax-console-scene',start:'top bottom',end:'bottom top',scrub:1 } });
      gsap.to('.ax-paper-front', { y:-15, rotation:-4, ease:'none',scrollTrigger:{ trigger:'.ax-paper-scene',start:'top 70%',end:'bottom 15%',scrub:1 } });
      const cleanup = [];
      $$('[data-magnetic]').forEach(button => {
        function move(e) { const rect = button.getBoundingClientRect(); gsap.to(button, { x:(e.clientX - rect.left - rect.width/2) * .12, y:(e.clientY - rect.top - rect.height/2) * .18, duration:.3, overwrite:true }); }
        function leave() { gsap.to(button, { x:0, y:0, duration:.65, ease:'elastic.out(1,.4)', overwrite:true }); }
        button.addEventListener('pointermove',move);button.addEventListener('pointerleave',leave);
        cleanup.push(() => { button.removeEventListener('pointermove',move);button.removeEventListener('pointerleave',leave);gsap.set(button,{clearProps:'transform'}); });
      });
      return () => cleanup.forEach(fn => fn());
    });
    return () => desktopMotion.revert();
  });
  if (document.fonts?.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener('load', () => ScrollTrigger.refresh(), { once:true });
})();
