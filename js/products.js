(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  let rows=[];

  async function getRole(user){
    if(!user) return 'user';
    try{
      const snap=await fbDb.collection('users').doc(user.uid).get();
      return snap.exists ? String(snap.data().role||'user').toLowerCase() : 'user';
    }catch(e){ return 'user'; }
  }

  async function load(){
    const list=$('productsList');
    const user=fbAuth&&fbAuth.currentUser;
    if(!user){ if(list) list.innerHTML='<div class="empty-state"><h3>Sign in required</h3><p>Please sign in to view products.</p></div>'; return; }
    try{
      const role=await getRole(user);
      let q=fbDb.collection('products');
      // A User is ALWAYS UID-scoped. Never fall back to an unrestricted query.
      if((role==='user'||role==='employee')) q=q.where('user_id','==',user.uid);
      const snap=await q.get();
      rows=snap.docs.map(d=>({id:d.id,...d.data()}));
      render();
    }catch(e){
      console.error('[AssureX] Product load failed',e);
      if(list) list.innerHTML='<div class="empty-state"><h3>Unable to load products</h3><p>'+esc(e.code==='permission-denied'?'Firebase denied this product read. Check the deployed Firestore rules and the user role.':(e.message||e))+'</p></div>';
    }
  }

  function render(){
    const list=$('productsList'); if(!list)return;
    if(!rows.length){
      list.innerHTML='<div class="empty-state"><h3>No products found</h3><p>Add your first product to start managing warranty information.</p><a href="add-product.html" class="btn primary">Add Product</a></div>';return;
    }
    list.innerHTML=rows.map(p=>{
      const name=p.name||p.product_name||p.model||'Product';
      const id=p.product_id||p.productId||p.id||'—';
      const brand=p.brand||p.manufacturer||'—';
      const date=p.purchase_date||p.purchaseDate||'—';
      return '<article class="product-card"><div><strong>'+esc(name)+'</strong><p>'+esc(brand)+'</p></div><div><span>Product ID</span><b>'+esc(id)+'</b></div><div><span>Purchase Date</span><b>'+esc(date)+'</b></div></article>';
    }).join('');
  }

  function init(){
    if(!window.fbAuth||!window.fbDb)return;
    fbAuth.onAuthStateChanged(user=>{ if(user) load(); else render(); });
    window.addEventListener('assurex-role-ready',()=>{if(fbAuth.currentUser)load();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
