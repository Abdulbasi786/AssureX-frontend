/** AssureX Requirement XV — Data Validation.
 * Reusable client-side validation contract. Firestore rules remain authoritative.
 */
(function(){
  'use strict';
  const VERSION='15.0.0';
  const MAX_TEXT=5000;
  const SERIAL_RE=/^[A-Za-z0-9][A-Za-z0-9._\-\/]{2,79}$/;
  const PRODUCT_ID_RE=/^[A-Za-z0-9][A-Za-z0-9._\-]{1,79}$/;
  const CATEGORY_VALUES=['Component Failure','Screen Crack','Water Damage','Wear and Tear','Accidents','Misuse','Defective Components'];

  function s(v){ return String(v==null?'':v).trim(); }
  function err(code,field,message){ return {code,field,message}; }
  function dateOnly(v){
    const x=s(v); if(!x) return null;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(x)) return null;
    const d=new Date(x+'T00:00:00');
    if(Number.isNaN(d.getTime()) || d.toISOString().slice(0,10)!==x) return null;
    return d;
  }
  function finiteNumber(v){ const n=Number(v); return Number.isFinite(n)?n:null; }
  function validateProduct(product){
    const p=product||{}, errors=[], warnings=[];
    const id=s(p.id||p.product_id||p.productId);
    if(!id) errors.push(err('PRODUCT_ID_REQUIRED','productId','Product ID is required.'));
    else if(!PRODUCT_ID_RE.test(id)) errors.push(err('PRODUCT_ID_FORMAT','productId','Product ID contains unsupported characters or is too long.'));
    if(!s(p.name||p.product_name)) errors.push(err('PRODUCT_NAME_REQUIRED','productName','Product name is required.'));
    if(!s(p.brand)) errors.push(err('BRAND_REQUIRED','brand','Brand is required.'));
    if(!s(p.category)) errors.push(err('CATEGORY_REQUIRED','category','Product category is required.'));
    if(!s(p.model_number||p.modelNumber)) errors.push(err('MODEL_REQUIRED','modelNumber','Model number is required.'));
    const serial=s(p.serial_number||p.serialNumber);
    if(!serial) errors.push(err('SERIAL_REQUIRED','serialNumber','Serial number is required.'));
    else if(!SERIAL_RE.test(serial)) errors.push(err('SERIAL_FORMAT','serialNumber','Serial number contains unsupported characters or is too long.'));
    const purchase=s(p.purchase_date||p.purchaseDate);
    const pd=dateOnly(purchase);
    if(!purchase) errors.push(err('PURCHASE_DATE_REQUIRED','purchaseDate','Purchase date is required.'));
    else if(!pd) errors.push(err('PURCHASE_DATE_FORMAT','purchaseDate','Purchase date must use YYYY-MM-DD and be a real date.'));
    else if(pd>new Date(new Date().toDateString())) errors.push(err('PURCHASE_DATE_FUTURE','purchaseDate','Purchase date cannot be in the future.'));
    const price=finiteNumber(p.price!=null?p.price:p.purchase_price);
    if(price===null) errors.push(err('PRICE_REQUIRED','price','Purchase price must be a valid number.'));
    else if(price<0) errors.push(err('PRICE_RANGE','price','Purchase price cannot be negative.'));
    const wm=finiteNumber(p.warranty_months), em=finiteNumber(p.extended_warranty_months||0);
    if(wm===null || !Number.isInteger(wm) || wm<0 || wm>1200) errors.push(err('WARRANTY_MONTHS','warrantyMonths','Warranty months must be an integer from 0 to 1200.'));
    if(em===null || !Number.isInteger(em) || em<0 || em>1200) errors.push(err('EXTENDED_WARRANTY_MONTHS','extendedWarrantyMonths','Extended warranty months must be an integer from 0 to 1200.'));
    if(!s(p.warranty_provider)) warnings.push(err('WARRANTY_PROVIDER_MISSING','warrantyProvider','Warranty provider is not recorded.'));
    return {valid:errors.length===0,errors,warnings};
  }
  function validateClaim(input){
    const c=input||{}, p=c.product||{}, errors=[], warnings=[];
    const pid=s(c.productId||c.product_id||p.id||p.product_id);
    if(!pid) errors.push(err('CLAIM_PRODUCT_REQUIRED','productId','A registered product is required.'));
    const ft=s(c.faultType||c.damageCategory||c.damage_category||c.fault_category);
    if(!ft) errors.push(err('DAMAGE_CATEGORY_REQUIRED','faultType','Damage category is required.'));
    else if(!CATEGORY_VALUES.includes(ft)) errors.push(err('DAMAGE_CATEGORY_INVALID','faultType','Damage category is not one of the supported values.'));
    const desc=s(c.faultDescription||c.fault_description||c.description);
    if(!desc) errors.push(err('FAULT_DESCRIPTION_REQUIRED','faultDescription','Fault description is required.'));
    else if(desc.length>MAX_TEXT) errors.push(err('FAULT_DESCRIPTION_LENGTH','faultDescription','Fault description is too long.'));
    const repaired=s(c.previouslyRepaired).toLowerCase();
    if(!['yes','no'].includes(repaired)) errors.push(err('REPAIR_FLAG_INVALID','previouslyRepaired','Previously Repaired must be Yes or No.'));
    const count=finiteNumber(c.repairCount);
    if(repaired==='yes' && (count===null || !Number.isInteger(count) || count<1 || count>100)) errors.push(err('REPAIR_COUNT_INVALID','repairCount','Repair count must be an integer from 1 to 100 when prior repair is declared.'));
    if(repaired==='no' && c.repairCount!==undefined && s(c.repairCount)!=='' && Number(c.repairCount)!==0) warnings.push(err('REPAIR_COUNT_IGNORED','repairCount','Repair count is ignored when Previously Repaired is No.'));
    const pv=validateProduct(p); errors.push(...pv.errors); warnings.push(...pv.warnings);
    return {valid:errors.length===0,errors,warnings,engineVersion:VERSION};
  }
  function validateFiles(files){
    const errors=[]; const list=files||[];
    if(!window.AssureXStorage||typeof window.AssureXStorage.validate!=='function') return {valid:false,errors:[err('STORAGE_VALIDATOR_UNAVAILABLE','files','Document validation service is unavailable.')],engineVersion:VERSION};
    for(const item of list){ if(!item||!item.file) continue; try{window.AssureXStorage.validate(item.file);}catch(e){errors.push(err(e.code||'FILE_INVALID',item.field||item.documentType||'file',e.message||'Invalid file.'));} }
    return {valid:errors.length===0,errors,engineVersion:VERSION};
  }
  async function validateUniqueClaimId(ref){
    if(!ref||typeof ref.get!=='function') return {valid:false,errors:[err('CLAIM_ID_UNAVAILABLE','claimId','Claim reference is unavailable.')]};
    const snap=await ref.get();
    return snap.exists?{valid:false,errors:[err('DUPLICATE_CLAIM_ID','claimId','The generated Claim ID already exists. Please retry submission.')]}:{valid:true,errors:[]};
  }
  window.AssureXDataValidation={VERSION,validateProduct,validateClaim,validateFiles,validateUniqueClaimId};
})();
