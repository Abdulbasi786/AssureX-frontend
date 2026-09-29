(function(){'use strict';
 const KEY='assurex.sidebar.scroll';function init(){const bar=document.querySelector('#sidebar .sidebar-nav');if(!bar)return;
 try{const n=Number(sessionStorage.getItem(KEY));if(Number.isFinite(n)&&n>=0){bar.scrollTop=n;requestAnimationFrame(()=>{bar.scrollTop=n;});}else{bar.querySelector('[aria-current="page"],.nav-item.active')?.scrollIntoView({block:'nearest',inline:'nearest'});}}catch(_){}
 let waiting=false;bar.addEventListener('scroll',()=>{if(waiting)return;waiting=true;requestAnimationFrame(()=>{try{sessionStorage.setItem(KEY,String(bar.scrollTop));}catch(_){}waiting=false;});},{passive:true});
 document.querySelectorAll('#sidebar a[href]').forEach(a=>a.addEventListener('click',()=>{try{sessionStorage.setItem(KEY,String(bar.scrollTop));}catch(_){}}));}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();})();
