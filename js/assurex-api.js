/* Shared AssureX FastAPI bridge: no credentials are persisted or exposed in URLs. */
(function(w){'use strict';
 const DEFAULT='https://assure-x-backend-h2prbfmnn-ab2340761-4608.vercel.app';
 const base=String(w.ASSUREX_API_BASE||DEFAULT).replace(/\/+$/,'');
 async function request(path,options){
   const opts=options||{};
   const user=w.fbAuth?.currentUser||w.firebase?.auth?.().currentUser;
   if(opts.auth!==false&&!user)throw new Error('Sign in to use AssureX backend features.');
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),opts.timeout||20000);
   try{
     const headers=Object.assign({Accept:'application/json'},opts.headers||{});
     if(opts.body!==undefined&&!headers['Content-Type'])headers['Content-Type']='application/json';
     if(opts.auth!==false)headers.Authorization='Bearer '+await user.getIdToken();
     const response=await fetch(base+path,{method:opts.method||'GET',headers,body:opts.body,signal:controller.signal,mode:'cors',credentials:'omit'});
     const contentType=response.headers.get('content-type')||'';
     const raw=await response.text();
     if(!contentType.includes('application/json')){
       if(response.redirected||/<!doctype|<html/i.test(raw))throw new Error('Backend returned a login/HTML page. Check Vercel deployment protection and API access.');
       throw new Error('Backend returned a non-JSON response (HTTP '+response.status+').');
     }
     let data;try{data=raw?JSON.parse(raw):{};}catch(_){throw new Error('Backend returned invalid JSON.');}
     if(!response.ok){const detail=data.detail;const message=typeof detail==='string'?detail:detail?.message||data.message||data.error||('Backend HTTP '+response.status);const error=new Error(String(message));error.status=response.status;error.data=data;throw error;}
     return data;
   }catch(e){if(e.name==='AbortError')throw new Error('Backend request timed out. Please try again.');if(e instanceof TypeError)throw new Error('Cannot reach FastAPI. Check Vercel deployment visibility, CORS and network access.');throw e;}finally{clearTimeout(timer);}
 }
 w.AssureXAPI={base,request,health:()=>request('/health',{auth:false,timeout:9000}),readiness:()=>request('/api/models/readiness'),analyzeClaim:(claim,extra)=>request('/api/claims/analyze',{method:'POST',body:JSON.stringify(Object.assign({claim},extra||{})),timeout:45000}),reviewClaim:payload=>request('/api/claims/review',{method:'POST',body:JSON.stringify(payload),timeout:30000})};
})(window);
