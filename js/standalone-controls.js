/* Match dashboard appearance controls on standalone Products/Documents pages. */
(function(){'use strict';
  function boot(){
    const b=document.getElementById('themeButton'), menu=document.getElementById('themeMenu');
    if(!b || !window.AssureXTheme)return;
    b.setAttribute('aria-label','Appearance settings');
    b.addEventListener('click',function(e){
      e.preventDefault();
      if(menu){menu.classList.toggle('hidden');b.setAttribute('aria-expanded',String(!menu.classList.contains('hidden')));}
      else window.AssureXTheme.toggle();
    });
    document.getElementById('closeTheme')?.addEventListener('click',function(){menu?.classList.add('hidden');b.setAttribute('aria-expanded','false')});
    menu?.querySelectorAll('.theme-choice').forEach(function(c){
      c.addEventListener('click',function(){window.AssureXTheme.set(c.dataset.theme);menu.classList.add('hidden');b.setAttribute('aria-expanded','false')});
    });
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&menu&&!menu.classList.contains('hidden')){menu.classList.add('hidden');b.focus();b.setAttribute('aria-expanded','false')}});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
