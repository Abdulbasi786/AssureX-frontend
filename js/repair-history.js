(function(){
  'use strict';
  const COLLECTION='repair_records';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const stamp=v=>v&&v.toDate?v.toDate().toLocaleString():v&&v.seconds?new Date(v.seconds*1000).toLocaleString():v?new Date(v).toLocaleString():'—';
  const val=(id)=>document.getElementById(id)?.value?.trim()||'';
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v==null?'':v;};
  let rows=[], editingId=null, role='user';
  function canEdit(){return role==='user'||role==='admin'}
  function message(t,c){const e=document.getElementById('rhStatus');e.textContent=t;e.className='status '+(c||'');}
  async function getRole(){
    role=window.AssureXRole||'user';
    document.getElementById('readOnlyNote').style.display=canEdit()?'none':'';
    document.getElementById('formCard').style.display=canEdit()?'':'none';
  }
  async function loadProducts(){
    const sel=document.getElementById('productId');
    try{
      let q=fbDb.collection('products');
      if(role==='user') q=q.where('user_id','==',fbAuth.currentUser.uid);
      const snap=await q.get();
      const opts=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
      sel.innerHTML='<option value="">Select product</option>'+opts.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name||p.product_name||'Unnamed')+' · '+esc(p.serial_number||p.id)+'</option>').join('');
    }catch(e){sel.innerHTML='<option value="">Enter product ID manually below</option>';}
  }
  async function loadClaims(){
    const sel=document.getElementById('claimId');
    try{
      let q=fbDb.collection('claims');
      if(role==='user') q=q.where('userId','==',fbAuth.currentUser.uid);
      const snap=await q.get();
      const opts=snap.docs.map(d=>({id:d.id,...d.data()}));
      sel.innerHTML='<option value="">No claim / standalone repair</option>'+opts.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.id.slice(0,12))+' · '+esc(c.status||'pending')+' · '+esc(c.product?.name||'Claim')+'</option>').join('');
    }catch(e){sel.innerHTML='<option value="">Enter claim ID manually if needed</option>';}
  }
  function resetForm(){editingId=null;document.getElementById('formTitle').textContent='Add repair record';document.getElementById('saveRepair').textContent='Save repair record';['repairDate','serviceCenter','issueReported','diagnosis','repairPerformed','partsReplaced','repairCost','notes','documentIds'].forEach(id=>set(id,''));set('status','completed');set('warrantyCovered','unknown');set('productId','');set('claimId','');}
  function fill(r){editingId=r.id;document.getElementById('formTitle').textContent='Edit repair record';document.getElementById('saveRepair').textContent='Update repair record';set('productId',r.productId);set('claimId',r.claimId);set('repairDate',r.repairDate);set('serviceCenter',r.serviceCenter);set('issueReported',r.issueReported);set('diagnosis',r.diagnosis);set('repairPerformed',r.repairPerformed);set('partsReplaced',r.partsReplaced);set('repairCost',r.repairCost);set('warrantyCovered',r.warrantyCovered||'unknown');set('status',r.status||'completed');set('notes',r.notes);set('documentIds',(r.documentIds||[]).join(', '));window.scrollTo({top:0,behavior:'smooth'});}
  function render(){
    const filter=val('search').toLowerCase();
    const filtered=rows.filter(r=>JSON.stringify(r).toLowerCase().includes(filter));
    const list=document.getElementById('repairList');
    if(!filtered.length){list.innerHTML='<div class="empty">No repair records found.</div>';return;}
    list.innerHTML=filtered.map(r=>{
      const editable=canEdit();
      return '<article class="repair"><div class="repair-head"><div><h3>'+esc(r.serviceCenter||'Repair record')+'</h3><div class="muted">'+esc(r.repairDate||'Date not recorded')+' · '+esc(r.status||'completed')+'</div></div><span class="pill">'+esc(r.warrantyCovered||'unknown')+'</span></div><div class="grid"><div><small>Product</small><strong>'+esc(r.productName||r.productId||'—')+'</strong></div><div><small>Claim</small><strong>'+esc(r.claimId||'—')+'</strong></div><div><small>Issue</small><strong>'+esc(r.issueReported||'—')+'</strong></div><div><small>Diagnosis</small><strong>'+esc(r.diagnosis||'—')+'</strong></div><div><small>Repair performed</small><strong>'+esc(r.repairPerformed||'—')+'</strong></div><div><small>Parts</small><strong>'+esc(r.partsReplaced||'—')+'</strong></div><div><small>Cost</small><strong>'+esc(r.repairCost!==''&&r.repairCost!=null?r.repairCost:'—')+'</strong></div><div><small>Updated</small><strong>'+esc(stamp(r.updatedAt||r.createdAt))+'</strong></div></div>'+(r.notes?'<p class="notes">'+esc(r.notes)+'</p>':'')+'<div class="actions">'+(r.documentIds?.length?'<span class="muted">Documents: '+esc(r.documentIds.join(', '))+'</span>':'')+(editable?'<button class="btn secondary edit" data-id="'+esc(r.id)+'">Edit</button><button class="btn danger delete" data-id="'+esc(r.id)+'">Delete</button>':'')+'</div></article>';
    }).join('');
    list.querySelectorAll('.edit').forEach(b=>b.onclick=()=>fill(rows.find(x=>x.id===b.dataset.id)));
    list.querySelectorAll('.delete').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this repair record?'))return;try{await fbDb.collection(COLLECTION).doc(b.dataset.id).delete();await audit('repair_record_deleted',{repairRecordId:b.dataset.id});message('Repair record deleted.','success');await load();}catch(e){message(e.message||'Could not delete repair record.','error');}});
  }
  async function audit(action,data){try{await fbDb.collection('audit_logs').add({action,...data,userId:fbAuth.currentUser?.uid||'',createdAt:firebase.firestore.FieldValue.serverTimestamp()});}catch(e){console.warn('Audit log failed',e);}}
  async function load(){
    try{
      let q=fbDb.collection(COLLECTION);
      if(role==='user') q=q.where('userId','==',fbAuth.currentUser.uid);
      const snap=await q.get();
      rows=snap.docs.map(d=>({id:d.id,...d.data()}));
      rows.sort((a,b)=>String(b.repairDate||'').localeCompare(String(a.repairDate||'')));
      render();
      document.getElementById('count').textContent=rows.length+' record'+(rows.length===1?'':'s');
    }catch(e){document.getElementById('repairList').innerHTML='<div class="empty error">'+esc(e.message||'Unable to load repair records.')+'</div>';}
  }
  async function save(){
    if(!canEdit())return;
    const user=fbAuth.currentUser;if(!user){message('Please sign in first.','error');return;}
    const productId=val('productId');if(!productId){message('Select or enter a product.','error');return;}
    const data={userId:user.uid,productId,claimId:val('claimId'),repairDate:val('repairDate'),serviceCenter:val('serviceCenter'),issueReported:val('issueReported'),diagnosis:val('diagnosis'),repairPerformed:val('repairPerformed'),partsReplaced:val('partsReplaced'),repairCost:val('repairCost'),warrantyCovered:val('warrantyCovered')||'unknown',status:val('status')||'completed',notes:val('notes'),documentIds:val('documentIds').split(',').map(x=>x.trim()).filter(Boolean),updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
    try{
      document.getElementById('saveRepair').disabled=true;
      if(editingId){await fbDb.collection(COLLECTION).doc(editingId).update(data);await audit('repair_record_updated',{repairRecordId:editingId,productId});message('Repair record updated.','success');}
      else {data.createdAt=firebase.firestore.FieldValue.serverTimestamp();data.createdBy=user.uid;const ref=await fbDb.collection(COLLECTION).add(data);await audit('repair_record_created',{repairRecordId:ref.id,productId,claimId:data.claimId});message('Repair record saved.','success');}
      resetForm();await load();
    }catch(e){message(e.message||'Could not save repair record.','error');}finally{document.getElementById('saveRepair').disabled=false;}
  }
  function init(){
    role=window.AssureXRole||'user';getRole();
    document.getElementById('saveRepair').onclick=save;document.getElementById('resetRepair').onclick=resetForm;document.getElementById('refresh').onclick=load;document.getElementById('search').oninput=render;
    window.addEventListener('assurex-role-ready',async e=>{role=e.detail.role;await getRole();await loadProducts();await loadClaims();await load();});
    loadProducts();loadClaims();load();
  }
  window.addEventListener('DOMContentLoaded',()=>{if(window.fbAuth)fbAuth.onAuthStateChanged(u=>{if(u)init();});});
})();
