/** AssureX role-based access control (client UI guard; Firestore rules remain authoritative). */
(function(){
  'use strict';
  const ROLE_KEY='assurex-role';
  const USER_NAV=new Set(['dashboard','products','warranties','documents','claims','profile']);
  const roles=['user','reviewer','employee','admin'];
  const PAGE_RULES={
    dashboard:['user','reviewer','employee','admin'],
    products:['user','reviewer','employee','admin'],
    warranties:['user','reviewer','employee','admin'],
    documents:['user','reviewer','employee','admin'],
    repairHistory:['reviewer','admin'],
    claims:['user','reviewer','employee','admin'],
    validation:['reviewer','admin'],
    evaluation:['reviewer','admin'],
    decision:['reviewer','admin'],
    analytics:['reviewer','admin'],
    readiness:['reviewer','admin'],
    profile:['user','reviewer','employee','admin'],
    admin:['admin'],
    warrantyPolicies:['admin']
  };
  const URLS={documents:'documents.html',evaluation:'evaluation.html',repairHistory:'repair-history.html',dashboard:'dashboard.html',products:'products.html',warranties:'warranties.html',claims:'claims.html',validation:'validation.html',decision:'decision.html',analytics:'analytics.html',readiness:'readiness.html',profile:'profile.html',admin:'admin.html',warrantyPolicies:'warranty-policies.html'};
  function normalize(v){v=String(v||'').toLowerCase().trim();return roles.includes(v)?v:'user'}
  async function getRole(user){
    if(!user||!window.fbDb)throw new Error('Authentication not initialized');
    const snapshot=await fbDb.collection('users').doc(user.uid).get();
    if(!snapshot.exists || snapshot.data().isActive===false)throw new Error('Account unavailable or disabled');
    const raw=String(snapshot.data().role||'user').toLowerCase().trim();
    if(!roles.includes(raw))throw new Error('Invalid account role');
    return raw;
  }
  function pageName(){const p=(location.pathname.split('/').pop()||'dashboard.html').toLowerCase();if(p==='index.html'||p==='login.html'||p==='register.html')return p.replace('.html','');if(['product.html','products.html','products(1).html','add-product.html'].includes(p))return 'products';if(p==='repair-history.html')return 'repairHistory';if(p==='warranty-policies.html')return 'warrantyPolicies';return p.replace('.html','');}
  function allowed(page,role){return (PAGE_RULES[page]||[]).includes(role)}
  function redirectFor(role){return role==='user'?'dashboard.html':'dashboard.html'}
  function applyNav(role){
    document.querySelectorAll('.sidebar .nav-item').forEach(function(el){
      const p=el.dataset.page || Object.keys(URLS).find(k=>URLS[k]===(el.getAttribute('href')||el.closest('a[href]')?.getAttribute('href')));
      if(!p)return;
      const show=(role==='user'||role==='employee')?USER_NAV.has(p):allowed(p,role);
      // Hide the whole anchor, otherwise the parent remains in sidebar and leaves empty space.
      const wrapper=el.closest('a[href]')||el;
      wrapper.style.display=show?'':'none';
    });
    document.querySelectorAll('.sidebar .sidebar-section-label').forEach(function(label){
      let next=label.nextElementSibling;
      if(next&&next.classList.contains('sidebar-nav')){
        // The MANAGEMENT label may also occur within the nav itself.
        return;
      }
      if(label.parentElement?.classList.contains('sidebar-nav')){
        const items=[];let x=label.nextElementSibling;
        while(x&&!x.classList.contains('sidebar-section-label')){items.push(x);x=x.nextElementSibling;}
        label.style.display=items.some(e=>e.style.display!=='none'&&e.querySelector?.('.nav-item:not([style*="display: none"])'))?'':'none';
      }
    });
    const roleEls=document.querySelectorAll('#profileRole,#adminRole');roleEls.forEach(e=>e.textContent=role.charAt(0).toUpperCase()+role.slice(1));
    const u=window.fbAuth&&window.fbAuth.currentUser;if(u)document.querySelectorAll('#profileName').forEach(e=>e.textContent=u.displayName||u.email||'User');
    if(role==='reviewer')installReadOnly();
  }
  // Presentation-level safeguard; Firestore security rules must enforce the same boundaries.
  function installReadOnly(){
    if(window.__assurexReviewerReadOnly)return;
    window.__assurexReviewerReadOnly=true;
    const p=pageName();
    if(p==='decision')return; // Reviewers can explicitly save decisions here.
    const mutating=/^(save|submit|upload|delete|remove|replace|create|add product|add claim|run validation|verify|approve|reject|update|edit|reset password|change role|deactivate|activate|process|start analysis|analy[sz]e|run analysis)/i;
    function blocks(el){
      if(!el||el.closest('.sidebar,.topbar,.theme-menu,#commandPalette'))return false;
      if(el.closest('a[href]'))return false;
      if(el.matches('input[type=file],input[type=submit],input[type=reset]'))return true;
      if(el.matches('button,[role=button]'))return mutating.test((el.textContent||'').trim())||mutating.test(el.id.replace(/([A-Z])/g,' $1').trim());
      return false;
    }
    document.addEventListener('click',function(e){const el=e.target.closest('button,[role=button],input');if(blocks(el)){e.preventDefault();e.stopImmediatePropagation();}},true);
    document.addEventListener('submit',function(e){e.preventDefault();e.stopImmediatePropagation();},true);
    document.querySelectorAll('input[type=file]').forEach(el=>el.disabled=true);
    document.querySelectorAll('button,input[type=submit]').forEach(el=>{if(blocks(el)){el.disabled=true;el.title='Read-only for reviewer';}});
    // Dynamically generated CRUD buttons must also be caught above.
  }
  function guardNavigation(role){
    document.addEventListener('click',function(ev){
      const nav=ev.target.closest&&ev.target.closest('[data-page]');if(nav){const p=nav.dataset.page;if(PAGE_RULES[p]&&!allowed(p,role)){ev.preventDefault();ev.stopImmediatePropagation();location.href=redirectFor(role);return;}}
      const a=ev.target.closest&&ev.target.closest('a[href]');if(a){const href=(a.getAttribute('href')||'').split('?')[0].split('#')[0];const map={"decision.html":'decision',"repair-history.html":'repairHistory',"admin.html":'admin',"claims.html":'claims',"warranties.html":'warranties',"products.html":'products',"validation.html":'validation',"analytics.html":'analytics',"readiness.html":'readiness',"profile.html":'profile',"warranty-policies.html":'warrantyPolicies'};const p=map[href];if(p&&!allowed(p,role)){ev.preventDefault();ev.stopImmediatePropagation();location.href=redirectFor(role);}}
    },true);
  }
  function expose(role){window.AssureXRole=role;window.AssureXCan=function(p){return allowed(p,role)};document.documentElement.dataset.role=role;applyNav(role);guardNavigation(role);window.dispatchEvent(new CustomEvent('assurex-role-ready',{detail:{role:role}}));}
  async function init(){
    if(!window.fbAuth){console.error('[RBAC] Authentication is unavailable');return;}
    fbAuth.onAuthStateChanged(async function(user){
      if(!user){if(!['index','login','register'].includes(pageName()))location.href='login.html';return;}
      try {
        const role=await getRole(user);const page=pageName();
        if(PAGE_RULES[page]&&!allowed(page,role)){location.replace(redirectFor(role));return;}
        expose(role);
      } catch(err) {
        console.error('[RBAC] Access denied:',err);
        document.body.style.visibility='hidden';
        location.replace('login.html');
      }
    });
  }
  window.AssureXRoleGuard={getRole,get allowed(){return PAGE_RULES}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
