/* AssureX global search: live, permission-scoped Firestore results. */
(function () {
  'use strict';
  const destinationQuery = new URLSearchParams(location.search).get('search');
  if (destinationQuery) {
    const localInput = document.getElementById('productSearch') || document.getElementById('docSearch');
    if (localInput) { localInput.value = destinationQuery; localInput.dispatchEvent(new Event('input', {bubbles:true})); }
  }
  const input = document.getElementById('globalSearch');
  if (!input) return;
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', 'assurex-search-results');
  const box = input.closest('.global-search');
  if (!box) return;
  box.style.position = 'relative';
  const panel = document.createElement('div');
  panel.id = 'assurex-search-results';
  panel.className = 'assurex-search-results';
  panel.setAttribute('role', 'listbox');
  panel.hidden = true;
  box.appendChild(panel);
  const escape = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const val = (o, keys) => keys.map(k => o[k]).find(x => typeof x === 'string' && x.trim()) || '';
  let rows = [], loaded = 0, loading = null, timer = null, active = -1, request = 0;
  const sections = [
    {kind:'Claim', method:'getClaims', url:r=>'decision.html?claimId='+encodeURIComponent(r.id), title:r=>val(r,['claimNumber','claimId','productName','product_name']) || r.id, detail:r=>[r.id,r.status,r.description,r.issueDescription].filter(Boolean).join(' · ')},
    {kind:'Product', method:'getProducts', url:r=>'products.html?search='+encodeURIComponent(val(r,['serialNumber','serial_number','name','product_name'])||r.id), title:r=>val(r,['name','productName','product_name','model'])||r.id, detail:r=>[r.id,r.serialNumber,r.serial_number,r.brand,r.model].filter(Boolean).join(' · ')},
    {kind:'Document', method:'getDocuments', url:r=>'documents.html?search='+encodeURIComponent(val(r,['fileName','name','claimId','productId'])||r.id), title:r=>val(r,['fileName','name','originalName','documentName'])||r.id, detail:r=>[r.id,r.claimId,r.productId,r.documentType,r.fileType].filter(Boolean).join(' · ')}
  ];
  const show = () => { panel.hidden=false; input.setAttribute('aria-expanded','true'); };
  const hide = () => { panel.hidden=true; input.setAttribute('aria-expanded','false'); active=-1; };
  async function fetchRows() {
    if (Date.now()-loaded < 45000 && rows.length) return rows;
    if (loading) return loading;
    loading = (async () => {
      if (!window.DbService || !window.fbAuth || !fbAuth.currentUser) throw new Error('Sign in to search your records.');
      const outcomes = await Promise.allSettled(sections.map(s => s.kind === 'Document' && window.AssureXStorage ? AssureXStorage.getDocuments() : DbService[s.method]()));
      if (outcomes.every(x=>x.status==='rejected')) throw new Error('Search data unavailable. Check your connection or access permissions.');
      rows = outcomes.flatMap((x,i)=>x.status==='fulfilled' && Array.isArray(x.value) ? x.value.map(r=>({kind:sections[i].kind, info:sections[i], record:r})) : []);
      loaded = Date.now();
      return rows;
    })().finally(()=>{loading=null;});
    return loading;
  }
  function matches(row,q) {
    const r=row.record;
    const fields = Object.entries(r).filter(([k,v]) => !/password|token|secret|credential|fileData|base64|chunk|image|blob/i.test(k) && (typeof v==='string'||typeof v==='number')).map(([,v])=>String(v));
    return fields.concat([r.id,row.kind]).join(' ').toLowerCase().includes(q);
  }
  function render(list,q) {
    active=-1;
    if (!list.length) {panel.innerHTML='<div class="ax-search-message">No records found for <strong>'+escape(q)+'</strong>.</div>'; show(); return;}
    const shown=list.slice(0,25);
    panel.innerHTML='<div class="ax-search-heading">Search results <span>'+list.length+(list.length>25?' (first 25 shown)':'')+'</span></div>'+shown.map((item,i)=>'<a role="option" class="ax-search-item" href="'+escape(item.info.url(item.record))+'" data-index="'+i+'"><span class="ax-search-kind">'+item.kind+'</span><span class="ax-search-text"><strong>'+escape(item.info.title(item.record))+'</strong><small>'+escape(item.info.detail(item.record))+'</small></span><span aria-hidden="true">↗</span></a>').join('');
    show();
  }
  async function search() {
    const q=input.value.trim().toLowerCase(); const ticket=++request;
    if(!q) {hide(); return;}
    panel.innerHTML='<div class="ax-search-message">Searching your records…</div>';show();
    try {const all=await fetchRows(); if(ticket!==request) return; render(all.filter(x=>matches(x,q)),input.value.trim());}
    catch(e) {if(ticket!==request)return; panel.innerHTML='<div class="ax-search-message ax-search-error">'+escape(e.message||'Search failed.')+'</div>';show();}
  }
  input.addEventListener('input',()=>{clearTimeout(timer); if(!input.value.trim()){++request;hide();return;} timer=setTimeout(search,180);});
  input.addEventListener('focus',()=>{if(input.value.trim()) search();});
  input.addEventListener('keydown',e=>{
    if(e.key==='Escape'){hide();input.blur();return;}
    if(e.key==='Enter' || e.key==='ArrowDown' || e.key==='ArrowUp') {
      e.stopImmediatePropagation();
      if(e.key==='Enter') {e.preventDefault(); const links=panel.querySelectorAll('a.ax-search-item'); if(!panel.hidden && links.length) {location.assign(links[Math.max(0,active)].href);}else search();return;}
      e.preventDefault();const links=panel.querySelectorAll('a.ax-search-item');if(!links.length)return;
      active=(active+(e.key==='ArrowDown'?1:-1)+links.length)%links.length;
      links.forEach((a,i)=>a.classList.toggle('ax-active',i===active)); links[active].scrollIntoView({block:'nearest'});
    }
  },true);
  document.addEventListener('pointerdown',e=>{if(!box.contains(e.target))hide();});
  window.addEventListener('pageshow',()=>{loaded=0;rows=[];});
})();
