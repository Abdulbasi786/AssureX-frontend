/** AssureX configurable warranty policy engine. */
(function(){
  'use strict';
  const DEFAULT_POLICIES = [
    {id:'standard-manufacturer', name:'Standard Manufacturer Warranty', active:true, priority:100, durationMonths:12,
      eligibleCategories:[], excludedCategories:[], coveredStatuses:['active'], exclusions:['accidental_damage','liquid_damage','unauthorized_repair','normal_wear'],
      graceDays:0, notes:'Default 12-month coverage. Configure policies in Warranty Policy Admin.'},
    {id:'extended-24', name:'Extended 24-Month Coverage', active:false, priority:90, durationMonths:24,
      eligibleCategories:[], excludedCategories:[], coveredStatuses:['active'], exclusions:['accidental_damage','liquid_damage','unauthorized_repair','normal_wear'], graceDays:0, notes:''}
  ];
  function date(v){ if(!v) return null; if(v.toDate) return v.toDate(); const d=new Date(v); return Number.isNaN(d.getTime())?null:d; }
  function addMonths(d,m){const x=new Date(d); const day=x.getDate(); x.setDate(1); x.setMonth(x.getMonth()+Number(m||0)); const last=new Date(x.getFullYear(),x.getMonth()+1,0).getDate(); x.setDate(Math.min(day,last)); return x;}
  function daysBetween(a,b){return Math.floor((b-a)/86400000);}
  function normalizePolicy(p){return Object.assign({durationMonths:0,priority:0,eligibleCategories:[],excludedCategories:[],coveredStatuses:['active'],exclusions:[],graceDays:0,active:true},p||{});}
  function selectPolicy(policies, product){
    const category=String(product.category||'').toLowerCase();
    return policies.filter(p=>p.active!==false).map(normalizePolicy).filter(p=>
      (!p.eligibleCategories.length || p.eligibleCategories.map(x=>String(x).toLowerCase()).includes(category)) &&
      (!p.excludedCategories.length || !p.excludedCategories.map(x=>String(x).toLowerCase()).includes(category))
    ).sort((a,b)=>Number(b.priority||0)-Number(a.priority||0))[0] || null;
  }
  function evaluate(product, policy, now){
    now=now||new Date(); policy=normalizePolicy(policy);
    const purchaseDate=date(product.purchase_date || product.purchaseDate);
    const baseMonths=Number(product.warranty_months||0);
    const extendedMonths=Number(product.extended_warranty_months||0);
    const policyMonths=Number(policy.durationMonths||0);
    const totalMonths=Math.max(baseMonths+extendedMonths, policyMonths);
    const reasons=[]; const checks=[];
    checks.push({key:'purchaseDate',label:'Purchase date available',passed:!!purchaseDate});
    if(!purchaseDate){ reasons.push('Purchase date is missing.'); }
    const expiry=purchaseDate&&totalMonths>0?addMonths(purchaseDate,totalMonths):null;
    checks.push({key:'coverageConfigured',label:'Coverage duration configured',passed:!!expiry});
    if(!expiry) reasons.push('No usable warranty duration is configured.');
    const expiryWithGrace=expiry?new Date(expiry.getTime()+Number(policy.graceDays||0)*86400000):null;
    const inWindow=!!expiryWithGrace && now<=expiryWithGrace;
    checks.push({key:'dateWindow',label:'Within warranty period',passed:inWindow});
    if(expiryWithGrace&&!inWindow) reasons.push('Warranty period has expired.');
    const productStatus=String(product.warranty_status||'active').toLowerCase();
    const statusOk=!policy.coveredStatuses.length||policy.coveredStatuses.includes(productStatus);
    checks.push({key:'status',label:'Warranty status eligible',passed:statusOk});
    if(!statusOk) reasons.push('Product warranty status is not eligible under this policy.');
    const excluded=Array.isArray(product.warranty_exclusions)?product.warranty_exclusions:[];
    const policyExclusions=policy.exclusions||[];
    const triggered=excluded.filter(x=>policyExclusions.includes(x));
    checks.push({key:'exclusions',label:'No configured exclusion triggered',passed:triggered.length===0});
    if(triggered.length) reasons.push('Configured exclusion applies: '+triggered.join(', ')+'.');
    const eligible=checks.every(x=>x.passed);
    return {eligible,status:eligible?'COVERED':(purchaseDate?'NOT COVERED':'REVIEW'),policyId:policy.id,policyName:policy.name,purchaseDate,expiry,graceExpiry:expiryWithGrace,totalMonths,checks,reasons};
  }
  async function loadPolicies(){
    if(!window.fbDb) return DEFAULT_POLICIES;
    try{const s=await fbDb.collection('warranty_policies').where('active','==',true).get(); if(s.empty)return DEFAULT_POLICIES; return s.docs.map(d=>Object.assign({id:d.id},d.data()));}
    catch(e){console.warn('[WarrantyEngine] policy load failed',e); return DEFAULT_POLICIES;}
  }
  async function evaluateProduct(product){const policies=await loadPolicies(); const policy=selectPolicy(policies,product); return policy?evaluate(product,policy):{eligible:false,status:'REVIEW',policyName:'No matching policy',checks:[],reasons:['No active warranty policy matches this product.']};}
  window.AssureXWarranty={DEFAULT_POLICIES,loadPolicies,selectPolicy,evaluate,evaluateProduct,date,addMonths};
})();
