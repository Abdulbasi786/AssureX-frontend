/** AssureX Requirement vii — OCR verification layer. */
(function(){
  'use strict';
  const FIELDS=[
    ['invoiceNumber','Invoice Number'],['purchaseDate','Purchase Date'],['productName','Product Name'],
    ['brand','Brand'],['modelNumber','Model Number'],['serialNumber','Serial Number'],['retailer','Retailer'],
    ['purchaseAmount','Purchase Amount'],['warrantyMonths','Warranty Months']
  ];
  const role=()=>String(window.AssureXRole||'user');
  const canVerify=()=>role()==='user'||role()==='admin';
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
  function values(doc){
    const o=doc?.ocr||{};
    return o.verifiedData && typeof o.verifiedData==='object' ? o.verifiedData : (o.structured||{});
  }
  function status(doc){
    const o=doc?.ocr||{};
    if(o.verificationStatus==='verified') return 'Verified';
    if(o.verificationStatus==='rejected') return 'Needs correction';
    return o.structured ? 'Pending verification' : 'No OCR yet';
  }
  async function save(doc, data){
    if(!canVerify()) throw new Error('Only the document owner or an admin can confirm OCR fields.');
    const u=window.fbAuth?.currentUser;if(!u) throw new Error('Please sign in.');
    const original=doc?.ocr||{};
    await window.fbDb.collection('documents').doc(doc.id).set({
      ocr:{
        ...original,
        verificationStatus:'verified',
        verifiedData:data,
        verifiedAt:firebase.firestore.FieldValue.serverTimestamp(),
        verifiedBy:u.uid,
        verifiedByEmail:u.email||'',
        verifiedVersion:Number(original.verifiedVersion||0)+1
      },
      ocrVerificationStatus:'verified',
      updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true});
    if(window.DbService?.logAudit) await window.DbService.logAudit('ocr_verified',{docId:doc.id,claimId:doc.claimId||'',productId:doc.productId||'',verifiedFields:Object.keys(data)});
  }
  async function reject(doc,note){
    if(!canVerify()) throw new Error('Only the document owner or an admin can change OCR verification status.');
    const u=window.fbAuth?.currentUser;if(!u) throw new Error('Please sign in.');
    const original=doc?.ocr||{};
    await window.fbDb.collection('documents').doc(doc.id).set({
      ocr:{...original,verificationStatus:'rejected',verificationNote:String(note||'').trim(),verifiedData:null,verifiedAt:null,verifiedBy:u.uid,verifiedByEmail:u.email||''},
      ocrVerificationStatus:'rejected',updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true});
    if(window.DbService?.logAudit) await window.DbService.logAudit('ocr_verification_rejected',{docId:doc.id,note:String(note||'').trim()});
  }
  function open(doc,onDone){
    const o=doc?.ocr||{};
    if(!o.structured) throw new Error('Run OCR first. There are no structured fields to verify.');
    const vals=values(doc);
    const editable=canVerify();
    const overlay=document.createElement('div');overlay.className='ocr-modal-backdrop';
    overlay.innerHTML='<div class="ocr-modal"><div class="ocr-modal-head"><div><h2>OCR Verification</h2><div class="hint">Original OCR remains unchanged. Confirmed values are saved separately as trusted verification data.</div></div><button class="btn secondary close">Close</button></div><div class="ocr-grid">'+FIELDS.map(([key,label])=>'<label class="field"><span>'+esc(label)+'</span><input data-ocr-field="'+key+'" value="'+esc(vals[key]??'')+'" '+(editable?'':'disabled')+'></label>').join('')+'</div><div class="ocr-source"><strong>OCR confidence:</strong> '+esc(o.confidence??'—')+'% · <strong>Status:</strong> '+esc(status(doc))+' '+(o.verifiedByEmail?'· Verified by '+esc(o.verifiedByEmail):'')+(o.verificationNote?'<br><strong>Note:</strong> '+esc(o.verificationNote):'')+'</div><details class="ocr-raw"><summary>View original OCR text</summary><pre>'+esc(o.rawText||'No raw OCR text saved.')+'</pre></details><div class="ocr-actions">'+(editable?'<button class="btn secondary reject">Mark for correction</button><button class="btn confirm">Confirm verified fields</button>':'')+'</div><div class="status modal-status"></div></div>';
    document.body.appendChild(overlay);
    const close=()=>overlay.remove();overlay.querySelector('.close').onclick=close;
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    const statusEl=overlay.querySelector('.modal-status');
    if(editable) overlay.querySelector('.confirm').onclick=async()=>{
      try{const data={};FIELDS.forEach(([key])=>data[key]=overlay.querySelector('[data-ocr-field="'+key+'"]').value.trim());statusEl.textContent='Saving verified fields…';await save(doc,data);statusEl.textContent='OCR fields verified successfully.';statusEl.className='status modal-status success';if(onDone)await onDone();setTimeout(close,450);}catch(e){statusEl.textContent=e.message||'Could not save verification.';statusEl.className='status modal-status error';}
    };
    if(editable) overlay.querySelector('.reject').onclick=async()=>{
      const note=prompt('Optional correction note:','OCR fields need correction.');
      if(note===null)return;
      try{statusEl.textContent='Saving correction status…';await reject(doc,note);statusEl.textContent='Marked for correction.';statusEl.className='status modal-status success';if(onDone)await onDone();}catch(e){statusEl.textContent=e.message||'Could not update status.';statusEl.className='status modal-status error';}
    };
  }
  window.AssureXOCRVerification={FIELDS,status,open,save,reject,canVerify};
})();
