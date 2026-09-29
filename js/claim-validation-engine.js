(function(){
  'use strict';

  function str(v){ return v == null ? '' : String(v).trim(); }
  function lower(v){ return str(v).toLowerCase(); }
  function norm(v){ return lower(v).replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim(); }
  function dateOf(v){
    if(!v) return null;
    if(v.toDate) return v.toDate();
    if(v.seconds != null) return new Date(Number(v.seconds)*1000);
    var d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function monthsBetween(a,b){ return Math.abs(b.getTime()-a.getTime())/(1000*60*60*24*30.4375); }
  function getProductId(c){ return str(c && (c.productId || c.product_id || (c.product && (c.product.id || c.product.productId)))); }
  function getSerial(p,c){ return str((p && (p.serial_number || p.serialNumber)) || (c && c.product && (c.product.serialNumber || c.product.serial_number)) || (c && (c.serialNumber || c.serial_number))); }
  function getProductName(p,c){ return str((p && (p.name || p.product_name || p.productName)) || (c && c.product && c.product.name) || (c && c.productName)); }
  function getFault(c){ return str(c && (c.fault && (c.fault.category || c.fault.type)) || c.faultType || c.damageCategory || c.damage_category); }
  function getFaultDescription(c){ return str(c && (c.fault && c.fault.description) || c.faultDescription || c.fault_description); }
  function getRepair(c){
    var r=c && (c.repairHistory || c.repair_history) || {};
    var raw=r.previouslyRepaired != null ? r.previouslyRepaired : c && c.previouslyRepaired;
    var yes=raw===true || /^(yes|true|1)$/i.test(str(raw));
    return {yes:yes,count:Number(r.repairCount != null ? r.repairCount : (c && c.repairCount || 0)) || 0,notes:str(r.notes != null ? r.notes : (c && (c.repairNotes || c.repair_notes)))};
  }
  function documentIds(c){
    var e=c && c.evidence || {}, ids=e.documentIds || [];
    if(Array.isArray(ids)) return ids.filter(Boolean);
    var out=[]; var d=e.documents||{}; Object.keys(d).forEach(function(k){(Array.isArray(d[k])?d[k]:[d[k]]).forEach(function(x){if(x)out.push(x);});}); return out;
  }
  function evidenceTypes(c){
    var e=c && c.evidence || {}, d=e.documents || {};
    return {
      invoice: !!(d.purchase_invoice || d.invoice || (Array.isArray(d.invoices)&&d.invoices.length)),
      warranty: !!(d.warranty_card || d.warranty || (Array.isArray(d.warranties)&&d.warranties.length)),
      repair: !!(d.repair_report || d.repair || (Array.isArray(d.repairs)&&d.repairs.length)),
      photos: !!(d.product_image || d.product_images || (Array.isArray(d.product_image)&&d.product_image.length) || (e.photoAnalysis && (e.photoAnalysis.results || e.photoAnalysis.text))),
      serial: !!(d.serial_evidence || d.serialEvidence),
      diagnostic: !!(d.diagnostic_report || d.diagnosticReport),
      fault: !!(d.fault_evidence || d.faultEvidence)
    };
  }
  function push(arr,code,severity,title,detail,source){ arr.push({code:code,severity:severity,title:title,detail:detail,source:source||'rule-engine'}); }

  function compareText(a,b){
    a=norm(a); b=norm(b); if(!a||!b)return false;
    return a===b || (a.length>=6 && b.includes(a)) || (b.length>=6 && a.includes(b));
  }

  function duplicateScore(current,other){
    if(!other || other.id===current.id) return 0;
    if(str(other.userId)!==str(current.userId)) return 0;
    if(getProductId(other)!==getProductId(current)) return 0;
    var serialA=norm(getSerial(null,current)), serialB=norm(getSerial(null,other));
    if(serialA && serialB && serialA!==serialB) return 0;
    var faultA=norm(getFault(current)), faultB=norm(getFault(other));
    if(faultA && faultB && faultA!==faultB) return 0;
    var descA=norm(getFaultDescription(current)), descB=norm(getFaultDescription(other));
    var similar=descA&&descB&&(descA===descB || (descA.length>15&&descB.includes(descA)) || (descB.length>15&&descA.includes(descB)));
    var da=dateOf(current.createdAt||current.created_at), db=dateOf(other.createdAt||other.created_at);
    var recent=da&&db&&monthsBetween(da,db)<=6;
    if(recent && similar) return 100;
    if(recent && faultA && faultA===faultB) return 75;
    return 0;
  }

  async function validate(input){
    input=input||{};
    var claim=input.claim||{};
    var product=input.product||null;
    var claims=Array.isArray(input.claims)?input.claims:[];
    var repairs=Array.isArray(input.repairs)?input.repairs:[];
    var docs=Array.isArray(input.documents)?input.documents:[];
    var findings=[];
    var hardBlocks=[];

    // 1. Product / ownership / identity checks
    var pid=getProductId(claim);
    if(!pid){ push(findings,'PRODUCT_ID_MISSING','error','Product reference missing','The claim does not contain a registered product ID.','product-check'); hardBlocks.push('PRODUCT_ID_MISSING'); }
    if(!product){ push(findings,'PRODUCT_NOT_FOUND','error','Registered product not found','The claim cannot be linked to a product record visible to the current account.','product-check'); hardBlocks.push('PRODUCT_NOT_FOUND'); }
    if(product && str(claim.userId) && str(product.user_id || product.userId) && str(claim.userId)!==str(product.user_id || product.userId)){
      push(findings,'PRODUCT_OWNER_MISMATCH','error','Product ownership mismatch','The selected product belongs to a different account.','product-check'); hardBlocks.push('PRODUCT_OWNER_MISMATCH');
    }

    var productSerial=norm(product && (product.serial_number||product.serialNumber));
    var claimSerial=norm(getSerial(product,claim));
    if(productSerial && claimSerial && productSerial!==claimSerial){
      push(findings,'SERIAL_MISMATCH','error','Serial number mismatch','The claim serial number does not match the registered product serial number.','serial-check'); hardBlocks.push('SERIAL_MISMATCH');
    } else if(!productSerial){
      push(findings,'SERIAL_MISSING','warning','Registered serial number missing','The product record has no serial number available for identity verification.','serial-check');
    }

    if(product){
      var snapshot=claim.product||{};
      [['name',getProductName(product,null),snapshot.name],['brand',product.brand,snapshot.brand],['modelNumber',product.model_number||product.modelNumber,snapshot.modelNumber]].forEach(function(x){
        if(str(x[1])&&str(x[2])&&!compareText(x[1],x[2])) push(findings,'PRODUCT_SNAPSHOT_CONTRADICTION','warning','Product snapshot differs','Claim snapshot '+x[0]+' does not match the current registered product.','product-check');
      });
    }

    // 2. Completeness / missing-document checks
    var et=evidenceTypes(claim), repair=getRepair(claim);
    if(!et.invoice) push(findings,'MISSING_INVOICE','error','Purchase invoice missing','A purchase invoice is required for claim validation.','missing-document');
    if(!et.warranty) push(findings,'MISSING_WARRANTY_DOCUMENT','error','Warranty evidence missing','A warranty card, warranty document, or stored warranty evidence is required.','missing-document');
    if(!et.photos) push(findings,'MISSING_PRODUCT_PHOTOS','error','Product photos missing','At least one product image is required for evidence validation.','missing-document');
    if(repair.yes && !et.repair){ push(findings,'MISSING_REPAIR_DOCUMENT','error','Repair history document missing','The claim declares prior repair but no repair-history document is linked.','missing-document'); }
    if(repair.yes && repair.count<=0 && !repair.notes){ push(findings,'REPAIR_DETAILS_MISSING','warning','Repair details incomplete','Prior repair is declared without a repair count or notes.','repair-check'); }

    // 3. Warranty / eligibility checks
    var warrantyResult=null;
    try{
      if(product && window.AssureXWarranty && typeof window.AssureXWarranty.evaluateProduct==='function') warrantyResult=await window.AssureXWarranty.evaluateProduct(product);
    }catch(e){ push(findings,'WARRANTY_ENGINE_ERROR','warning','Warranty engine unavailable','Warranty eligibility could not be fully evaluated: '+(e.message||e),'warranty-check'); }
    if(warrantyResult){
      if(warrantyResult.status==='NOT COVERED') push(findings,'WARRANTY_NOT_COVERED','error','Warranty eligibility failed',warrantyResult.reasons.join(' '),'warranty-check');
      else if(warrantyResult.status==='REVIEW') push(findings,'WARRANTY_REVIEW','warning','Warranty eligibility needs review',warrantyResult.reasons.join(' '),'warranty-check');
    } else if(product){
      var pd=dateOf(product.purchase_date||product.purchaseDate);
      if(!pd) push(findings,'PURCHASE_DATE_MISSING','error','Purchase date missing','The registered product has no valid purchase date.','eligibility');
      var total=Number(product.warranty_months||product.warrantyMonths||0)+Number(product.extended_warranty_months||product.extendedWarrantyMonths||0);
      if(!total) push(findings,'WARRANTY_DURATION_MISSING','warning','Warranty duration missing','No warranty duration is recorded for this product.','eligibility');
      else if(pd){ var exp=new Date(pd); exp.setMonth(exp.getMonth()+total); if(exp<new Date()) push(findings,'WARRANTY_EXPIRED','error','Warranty expired','Recorded warranty expiry is '+exp.toLocaleDateString()+'.','eligibility'); }
    }

    // 4. Contradictions from OCR / structured evidence stored on the claim or documents
    var ocr=claim.evidence && claim.evidence.ocr || {};
    var invoiceText=ocr.invoice && (ocr.invoice.text||ocr.invoice.rawText) || '';
    var warrantyText=ocr.warranty && (ocr.warranty.text||ocr.warranty.rawText) || '';
    var invoiceData=ocr.invoice && (ocr.invoice.verifiedData||ocr.invoice.structured) || {};
    var warrantyData=ocr.warranty && (ocr.warranty.verifiedData||ocr.warranty.structured) || {};
    function serialFromText(text){
      var m=String(text||'').match(/(?:serial(?:\s*(?:number|no|#))?|s\.?n\.?)[\s:#-]*([A-Z0-9][A-Z0-9._\/-]{4,})/i);
      return m?norm(m[1]):'';
    }
    var invoiceSerial=norm(invoiceData.serialNumber||invoiceData.serial_number)||serialFromText(invoiceText);
    var invoiceModel=norm(invoiceData.modelNumber||invoiceData.model_number);
    var invoiceName=norm(invoiceData.productName||invoiceData.product_name);
    var warrantySerial=norm(warrantyData.serialNumber||warrantyData.serial_number)||serialFromText(warrantyText);
    if(productSerial && invoiceSerial && productSerial!==invoiceSerial) push(findings,'INVOICE_SERIAL_CONTRADICTION','error','Invoice serial conflicts','Invoice OCR serial does not match the registered product serial.','contradiction');
    if(productSerial && warrantySerial && productSerial!==warrantySerial) push(findings,'WARRANTY_SERIAL_CONTRADICTION','error','Warranty serial conflicts','Warranty-document OCR serial does not match the registered product serial.','contradiction');
    if(product && invoiceModel && product.model_number && norm(product.model_number)!==invoiceModel) push(findings,'INVOICE_MODEL_CONTRADICTION','warning','Invoice model conflicts','Invoice OCR model does not match the registered product model.','contradiction');
    if(product && invoiceName && getProductName(product) && !compareText(invoiceName,getProductName(product))) push(findings,'INVOICE_PRODUCT_CONTRADICTION','warning','Invoice product conflicts','Invoice OCR product name does not match the registered product name.','contradiction');
    var purchaseDate=dateOf(product && (product.purchase_date||product.purchaseDate));
    var invoiceDate=dateOf(invoiceData.purchaseDate||invoiceData.purchase_date);
    if(purchaseDate && invoiceDate && Math.abs(purchaseDate-invoiceDate)>3*24*60*60*1000) push(findings,'PURCHASE_DATE_CONTRADICTION','warning','Purchase dates differ','Registered purchase date and invoice OCR purchase date differ by more than three days.','contradiction');
    if(warrantyData.warrantyMonths && product){
      var wm=Number(product.warranty_months||product.warrantyMonths||0); if(wm && Number(warrantyData.warrantyMonths)!==wm) push(findings,'WARRANTY_DURATION_CONTRADICTION','warning','Warranty duration differs','Warranty document OCR duration does not match the registered standard warranty duration.','contradiction');
    }
    var repairText=(ocr.repair && (ocr.repair.text||ocr.repair.rawText))||'';
    if(!repair.yes && repairText) push(findings,'REPAIR_DECLARATION_CONTRADICTION','warning','Repair history contradiction','Repair evidence is present even though the claim says the product was not previously repaired.','contradiction');
    if(repair.yes && !repairText && !et.repair) push(findings,'REPAIR_EVIDENCE_UNREADABLE','warning','Repair evidence not verified','Prior repair is declared but readable repair evidence is not available.','contradiction');

    // 5. Duplicate-claim detection
    var dup=claims.map(function(c){return {claim:c,score:duplicateScore(claim,c)};}).filter(function(x){return x.score>0;}).sort(function(a,b){return b.score-a.score;})[0];
    if(dup){
      var d=dup.claim;
      var sev=dup.score>=100?'error':'warning';
      push(findings,'POSSIBLE_DUPLICATE_CLAIM',sev,'Possible duplicate claim','Another claim for the same product and fault appears sufficiently similar. Existing claim: '+str(d.id||'unknown')+'.','duplicate-check');
      if(dup.score>=100) hardBlocks.push('POSSIBLE_DUPLICATE_CLAIM');
    }

    // 6. Persistent repair-record cross-check
    if(product){
      var linkedRepairs=repairs.filter(function(r){return str(r.productId)===str(pid);});
      if(linkedRepairs.length && !repair.yes) push(findings,'REPAIR_RECORD_CONTRADICTION','warning','Repair record conflicts','Repair history records exist for this product, but the claim declares no previous repair.','repair-check');
      if(repair.yes && repair.count && linkedRepairs.length && repair.count<linkedRepairs.length) push(findings,'REPAIR_COUNT_CONTRADICTION','warning','Repair count differs','Claimed repair count is lower than the number of stored repair records.','repair-check');
    }

    // 7. Basic required claim fields
    if(!getFault(claim)) push(findings,'FAULT_CATEGORY_MISSING','error','Fault category missing','A damage/fault category is required.','claim-completeness');
    if(!getFaultDescription(claim)) push(findings,'FAULT_DESCRIPTION_MISSING','error','Fault description missing','A fault description is required.','claim-completeness');

    var counts={error:0,warning:0,info:0}; findings.forEach(function(f){counts[f.severity]=(counts[f.severity]||0)+1;});
    var score=Math.max(0,100-(counts.error*15)-(counts.warning*5));
    var status=counts.error?'BLOCKED':counts.warning?'REVIEW':'PASS';
    return {
      status:status, score:score, findingCount:findings.length, counts:counts, findings:findings,
      hardBlocks:Array.from(new Set(hardBlocks)), warranty:warrantyResult,
      checkedAt:new Date().toISOString(), engine:'assurex-claim-validation', engineVersion:'1.0.0'
    };
  }

  async function validateDraft(claim,context){ return validate(Object.assign({},context||{}, {claim:claim})); }
  window.AssureXClaimValidation={validate:validate,validateDraft:validateDraft,version:'1.0.0'};
})();
