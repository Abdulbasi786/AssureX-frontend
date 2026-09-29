/* AssureX assistant: feature guide + conversational form filling.
   No external AI service is used and nothing is sent anywhere: answers stay in the browser
   (sessionStorage is used only to hand a draft to the next page, then it is deleted).
   The assistant only FILLS forms; the user always reviews and presses Submit/Save. */
(function(){'use strict';

var DRAFT_KEY='axChatFormDraft',DRAFT_TTL=10*60*1000;

/* ---------- Form definitions (ids = real element ids on each page) ---------- */
var YESNO=[{label:'No',value:'no'},{label:'Yes',value:'yes'}];
var FORMS={
 product:{title:'Add Product',page:'add-product.html',submitLabel:'Add Product',fields:[
  {id:'product_id',label:'Product ID',q:'What is the Product ID? (e.g. PRD-55645)',required:true},
  {id:'name',label:'Product name',q:'What is the product name? (e.g. Laptop)',required:true},
  {id:'brand',label:'Brand',q:'Which brand is it? (e.g. Samsung)',required:true},
  {id:'category',label:'Category',q:'Which category? (e.g. Home Appliance)',required:true},
  {id:'model_number',label:'Model number',q:'What is the model number?',required:true},
  {id:'serial_number',label:'Serial number',q:'What is the serial number?',required:true},
  {id:'price',label:'Price',q:'What is the purchase price? (number only, e.g. 95299)',type:'number',required:true},
  {id:'retailer',label:'Retailer',q:'Which retailer/shop did you buy it from?'},
  {id:'purchase_date',label:'Purchase date',q:'When did you buy it? (YYYY-MM-DD or DD/MM/YYYY)',type:'date',required:true},
  {id:'warranty_months',label:'Warranty (months)',q:'How many months of warranty does it have?',type:'int',required:true},
  {id:'extended_warranty_months',label:'Extended warranty (months)',q:'Any extended warranty, in months?',type:'int'},
  {id:'warranty_provider',label:'Warranty provider',q:'Who is the warranty provider?',required:true},
  {id:'service_center',label:'Service center',q:'Which service center handles it?'},
  {id:'coverage_conditions',label:'Coverage conditions',q:'What does the warranty cover?',type:'long'},
  {id:'exclusions',label:'Exclusions',q:'What is excluded from the warranty?',type:'long'}
 ]},
 claim:{title:'Claim',page:'claims.html',submitLabel:'Submit Claim',
  after:'Next, go to Step 2 and upload your invoice, warranty document and product photos. I cannot attach files for you.',fields:[
  {id:'claimProduct',label:'Product',q:'Which product is this claim for?',type:'product',required:true},
  {id:'faultType',label:'Damage category',q:'What type of damage is it?',type:'select',required:true,options:[
   'Component Failure','Screen Crack','Water Damage','Wear and Tear','Accidents','Misuse','Defective Components'].map(function(x){return{label:x,value:x}})},
  {id:'faultDescription',label:'Fault description',q:'Please describe the fault or damage.',type:'long',required:true},
  {id:'previouslyRepaired',label:'Previously repaired',q:'Has this product been repaired before?',type:'select',required:true,options:YESNO,yesno:true},
  {id:'repairCount',label:'Repair count',q:'How many times was it repaired before?',type:'int',min:1,required:true,
   showIf:function(a){return a.previouslyRepaired==='yes'}},
  {id:'repairNotes',label:'Repair notes',q:'Any details about the previous repairs?',type:'long'}
 ]},
 repair:{title:'Repair Record',page:'repair-history.html',submitLabel:'Save repair record',guard:'formCard',fields:[
  {id:'productId',label:'Product',q:'Which product was repaired?',type:'product',required:true},
  {id:'repairDate',label:'Repair date',q:'When was it repaired? (YYYY-MM-DD or DD/MM/YYYY)',type:'date'},
  {id:'serviceCenter',label:'Service center',q:'Which service center or technician did the repair?'},
  {id:'issueReported',label:'Issue reported',q:'What issue was reported?'},
  {id:'diagnosis',label:'Diagnosis',q:'What was the diagnosis?'},
  {id:'repairPerformed',label:'Repair performed',q:'What repair work was done?',type:'long'},
  {id:'partsReplaced',label:'Parts replaced',q:'Which parts were replaced?'},
  {id:'repairCost',label:'Repair cost',q:'What was the repair cost? (number only)',type:'number'},
  {id:'warrantyCovered',label:'Warranty covered',q:'Was it covered by warranty?',type:'select',options:[
   {label:'Yes',value:'yes'},{label:'No',value:'no'},{label:'Partially',value:'partial'},{label:'Unknown',value:'unknown'}],yesno:true},
  {id:'status',label:'Status',q:'What is the repair status?',type:'select',options:[
   {label:'Completed',value:'completed'},{label:'Open',value:'open'},{label:'Cancelled',value:'cancelled'}]},
  {id:'notes',label:'Notes',q:'Any additional notes?',type:'long'}
 ]}
};

/* ---------- helpers ---------- */
function pad(n){return n<10?'0'+n:''+n}
function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function parseDate(t){
 var s=t.trim().toLowerCase(),d=new Date(),m,y,mo,da;
 if(s==='today'||s==='aaj')return iso(d);
 if(s==='yesterday'){d.setDate(d.getDate()-1);return iso(d)}
 if((m=s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/))){y=+m[1];mo=+m[2];da=+m[3]}
 else if((m=s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/))){da=+m[1];mo=+m[2];y=+m[3]}
 else return null;
 var c=new Date(y,mo-1,da);
 if(c.getFullYear()!==y||c.getMonth()!==mo-1||c.getDate()!==da||y<1990||c>new Date())return null;
 return iso(c);
}
function parseAnswer(f,t){
 if(f.type==='number'||f.type==='int'){
  var n=Number(t.replace(/^(rs\.?|pkr)\s*/i,'').replace(/[,\s]/g,''));
  if(t===''||!isFinite(n))return{err:'Please enter a number, e.g. 95299.'};
  var min=f.min!=null?f.min:0;
  if(n<min)return{err:'The value must be at least '+min+'.'};
  if(f.type==='int'&&Math.floor(n)!==n)return{err:'Please enter a whole number.'};
  return{v:String(n)};
 }
 if(f.type==='date'){var d=parseDate(t);return d?{v:d}:{err:'I could not read that date (or it is in the future). Use YYYY-MM-DD or DD/MM/YYYY, e.g. 2025-03-14 or 14/03/2025.'}}
 if(f.type==='select'){
  var s=t.toLowerCase();
  if(f.yesno){if(/^(haan|han|ji|ji haan|yes|y)$/.test(s))s='yes';else if(/^(nahi|nahin|na|no|n)$/.test(s))s='no'}
  var o=f.options.filter(function(x){return x.label.toLowerCase()===s||x.value.toLowerCase()===s})[0];
  return o?{v:o.value,shown:o.label}:{err:'Please choose one of the options shown.'};
 }
 return{v:t};
}
function waitFor(test,ms){return new Promise(function(res){var t0=Date.now();(function poll(){var r=test();if(r||Date.now()-t0>ms)return res(r);setTimeout(poll,200)})()})}
function matchOption(el,text){
 var q=String(text||'').toLowerCase();if(!q)return null;
 var o=Array.prototype.filter.call(el.options,function(x){return x.value!==''&&x.textContent.toLowerCase().indexOf(q)>-1})[0];
 return o?o.value:null;
}
function setField(el,v){
 el.value=v;
 el.dispatchEvent(new Event('input',{bubbles:true}));
 el.dispatchEvent(new Event('change',{bubbles:true}));
 return el.tagName!=='SELECT'||el.value===v;
}
function onPage(page){var p=location.pathname.split('/').pop()||'index.html';return p===page}
function getProducts(){
 return new Promise(function(resolve){
  if(!window.fbDb||!window.fbAuth)return resolve(null);
  var done=false;function finish(v){if(!done){done=true;resolve(v)}}
  setTimeout(function(){finish(null)},4000);
  function load(user){
   if(!user)return finish(null);
   window.fbDb.collection('products').where('user_id','==',user.uid).get().then(function(snap){
    finish(snap.docs.map(function(d){var p=d.data();return{id:d.id,label:(p.name||p.product_name||'Unnamed product')+(p.serial_number?' — '+p.serial_number:'')}}));
   }).catch(function(){finish(null)});
  }
  if(window.fbAuth.currentUser)load(window.fbAuth.currentUser);
  else{var un=window.fbAuth.onAuthStateChanged(function(u){if(typeof un==='function')un();load(u)})}
 });
}

/* Fill the real form on the current page. Never submits it. */
async function applyDraft(d){
 var form=FORMS[d.form],res={filled:0,missing:[],blocked:false},first=null;
 if(!form)return res;
 var guard=form.guard&&document.getElementById(form.guard);
 if(guard&&guard.style.display==='none'){res.blocked=true;return res}
 for(var i=0;i<form.fields.length;i++){
  var f=form.fields[i],a=d.answers[f.id];
  if(!a||(a.v==null&&!a.hint))continue;
  var el=document.getElementById(f.id);
  if(!el){res.missing.push(f.label);continue}
  var val=a.v;
  if(f.type==='product'){
   await waitFor(function(){return el.options&&el.options.length>1},12000);
   var has=a.v&&Array.prototype.some.call(el.options,function(o){return o.value===a.v});
   val=has?a.v:matchOption(el,a.hint||a.shown);
   if(!val){res.missing.push(f.label);continue}
  }
  if(setField(el,val)){res.filled++;if(!first)first=el;el.classList.add('ax-filled-by-assistant');(function(x){setTimeout(function(){x.classList.remove('ax-filled-by-assistant')},8000)})(el)}
  else res.missing.push(f.label);
 }
 if(first&&first.scrollIntoView)try{first.scrollIntoView({block:'center',behavior:'smooth'})}catch(e){}
 return res;
}

/* ---------- UI ---------- */
function init(){if(document.getElementById('axChatLauncher'))return;
var shell=document.createElement('div');shell.className='ax-chat-shell';shell.innerHTML='<button type="button" class="ax-chat-launcher" id="axChatLauncher" aria-label="Open AssureX assistant" title="Ask AssureX" aria-controls="axChatPanel" aria-expanded="false"><span class="ax-chat-launcher-icon" aria-hidden="true"><img class="ax-chat-icon ax-chat-icon-dark" src="asset/chatbot-icon-dark.png" alt=""><img class="ax-chat-icon ax-chat-icon-light" src="asset/chatbot-icon-light.png" alt=""></span><span class="ax-chat-launcher-label">Ask AssureX</span><span class="ax-chat-launcher-dot" aria-hidden="true"></span></button><section class="ax-chat-panel" id="axChatPanel" role="dialog" aria-label="AssureX help assistant" hidden><header class="ax-chat-header"><div class="ax-chat-avatar" aria-hidden="true"><img class="ax-chat-avatar-icon ax-chat-icon-dark" src="asset/chatbot-icon-dark.png" alt=""><img class="ax-chat-avatar-icon ax-chat-icon-light" src="asset/chatbot-icon-light.png" alt=""></div><div class="ax-chat-heading"><strong>AssureX Assistant</strong><span><i></i> Workspace help · Form filling</span></div><button class="ax-chat-close" type="button" aria-label="Close assistant" id="axChatClose">×</button></header><div class="ax-chat-intro"><span class="ax-chat-eyebrow">YOUR WORKSPACE COMPANION</span><h3>How can I help?</h3><p>Find your way around, or let me fill a form with you step by step.</p></div><div class="ax-chat-messages" id="axChatMessages" role="log" aria-live="polite" aria-relevant="additions"><div class="ax-chat-message assistant">Hi! I can help you navigate AssureX, or fill in a form for you (product, claim or repair record) by asking simple questions. Choose a suggestion or ask.</div></div><div class="ax-chat-suggestions" id="axChatSuggestions"><button type="button" data-start="menu">Fill a form ✎</button><button type="button" data-question="How do I submit a claim?">Submit a claim ↗</button><button type="button" data-question="Where can I check warranty?">Check warranty ↗</button><button type="button" data-question="How do I track repairs?">Repair history ↗</button></div><form class="ax-chat-form" id="axChatForm"><label class="ax-chat-sr" for="axChatInput">Ask a question</label><input id="axChatInput" maxlength="500" autocomplete="off" placeholder="Ask about AssureX…" required><button type="submit" aria-label="Send message">➤</button></form><footer class="ax-chat-footnote">Feature guide &amp; form assistant · No AI backend connected</footer></section>';document.body.appendChild(shell);
var openButton=shell.querySelector('#axChatLauncher'),panel=shell.querySelector('#axChatPanel'),closeButton=shell.querySelector('#axChatClose'),messages=shell.querySelector('#axChatMessages'),input=shell.querySelector('#axChatInput');
function setOpen(open){panel.hidden=!open;openButton.setAttribute('aria-expanded',String(open));openButton.classList.toggle('is-open',open);if(open)input.focus();else openButton.focus();}
openButton.addEventListener('click',function(){setOpen(panel.hidden)});closeButton.addEventListener('click',function(){setOpen(false)});document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!panel.hidden)setOpen(false)});

var destinations=[{match:/repair|service history/i,title:'Repair History',url:'repair-history.html',form:'repair',answer:'Open Repair History to view logged service and repair records.'},{match:/polic(y|ies)|coverage rules/i,title:'Warranty Policies',url:'warranty-policies.html',answer:'Open Warranty Policies to review warranty terms and coverage rules.'},{match:/warrant(y|ies)|expired|coverage/i,title:'Warranties',url:'warranties.html',answer:'Open Warranties to see registered product coverage and warranty information.'},{match:/document|invoice|receipt|upload|ocr/i,title:'Documents',url:'documents.html',answer:'Use Documents to find supporting evidence and uploaded files for your claims.'},{match:/claim|submit|file a case/i,title:'Claims',url:'claims.html',form:'claim',answer:'Open Claims to see existing claims or start a claim using the available action on that page.'},{match:/product|register device/i,title:'Products',url:'products.html',form:'product',answer:'Go to Products to register or manage your products.'},{match:/review|decision|approval|reject/i,title:'Decision & Review',url:'decision.html',answer:'Decision & Review shows claim review and recorded decisions, based on your access rights.'},{match:/evaluat|model|ai analysis/i,title:'Model Evaluation',url:'evaluation.html',answer:'Visit Model Evaluation to review the evaluation workflow.'},{match:/validat|verify/i,title:'Validation',url:'validation.html',answer:'Visit Validation to review claim validation information.'},{match:/analytics|report|statistic/i,title:'Analytics',url:'analytics.html',answer:'Open Analytics for workspace metrics and reports.'},{match:/user manage|admin|account role/i,title:'Admin',url:'admin.html',answer:'Admin tools are available only to authorized accounts.'},{match:/profile|password|account|settings/i,title:'Profile',url:'profile.html',answer:'Open Profile to view and manage your account details.'},{match:/dashboard|home|overview/i,title:'Dashboard',url:'dashboard.html',answer:'Open Dashboard for the workspace overview.'}];

function removeChips(){messages.querySelectorAll('.ax-chat-chips').forEach(function(n){n.remove()})}
function addChips(chips){
 var wrap=document.createElement('div');wrap.className='ax-chat-chips';
 chips.forEach(function(c){var b=document.createElement('button');b.type='button';b.className='ax-chat-chip'+(c.cls?' '+c.cls:'');b.textContent=c.label;b.addEventListener('click',function(){removeChips();c.fn()});wrap.appendChild(b)});
 messages.appendChild(wrap);messages.scrollTop=messages.scrollHeight;
}
function addMessage(text,kind,url,title,chips){
 if(kind==='user')removeChips();
 var div=document.createElement('div');div.className='ax-chat-message '+kind;div.textContent=text;
 if(url){var a=document.createElement('a');a.href=url;a.className='ax-chat-link';a.textContent='Open '+title+' ↗';div.appendChild(document.createElement('br'));div.appendChild(a)}
 messages.appendChild(div);messages.scrollTop=messages.scrollHeight;
 if(chips&&chips.length)addChips(chips);
}

/* ---------- guided form-filling flow ---------- */
var flow=null;
function setFlowActive(on){input.maxLength=on?1000:500;input.placeholder=on?'Type your answer…':'Ask about AssureX…'}
function values(){var o={};Object.keys(flow.answers).forEach(function(k){o[k]=flow.answers[k].v});return o}
function isVisible(f){return !f.showIf||f.showIf(values())}
function nextVisible(from){for(var i=from;i<flow.form.fields.length;i++)if(isVisible(flow.form.fields[i]))return i;return -1}
function prevVisible(from){for(var i=from;i>=0;i--)if(isVisible(flow.form.fields[i]))return i;return -1}
function endFlow(){flow=null;setFlowActive(false)}
function cancelFlow(){if(!flow)return;endFlow();addMessage('Okay, cancelled. Nothing was filled or saved.','assistant',null,null,[{label:'Fill another form',fn:showMenu}])}
function showMenu(){
 addMessage('Which form would you like to fill?','assistant',null,null,[
  {label:'Add a product',fn:function(){addMessage('Add a product','user');startForm('product')}},
  {label:'Submit a claim',fn:function(){addMessage('Submit a claim','user');startForm('claim')}},
  {label:'Add a repair record',fn:function(){addMessage('Add a repair record','user');startForm('repair')}}]);
}
function startForm(key){
 var form=FORMS[key];if(!form)return;
 flow={key:key,form:form,i:0,answers:{},stage:'ask',products:undefined};setFlowActive(true);
 addMessage('Let\'s fill the '+form.title+' form. I\'ll ask one question at a time. You can say "skip" for optional questions, "back" to change the previous answer, or "cancel" anytime. I will only fill the form; you review it and press '+form.submitLabel+' yourself.','assistant');
 ask();
}
function ask(){
 if(!flow)return;
 var i=nextVisible(flow.i);if(i<0)return summary();
 flow.i=i;var f=flow.form.fields[i];
 var vis=flow.form.fields.filter(isVisible),pos=vis.indexOf(f)+1;
 var chips=[],q=f.q;
 if(f.type==='product'){
  if(flow.products===undefined){
   addMessage('Checking your registered products…','assistant');var cur=flow;
   getProducts().then(function(list){
    if(flow!==cur)return;flow.products=list;
    if(list&&!list.length){endFlow();addMessage('I could not find any registered products on your account. Add a product first, then come back to this form.','assistant',null,null,[{label:'Add a product',fn:function(){addMessage('Add a product','user');startForm('product')}}]);return}
    ask();
   });return;
  }
  if(flow.products&&flow.products.length){
   flow.products.slice(0,8).forEach(function(p){chips.push({label:p.label.length>42?p.label.slice(0,41)+'…':p.label,fn:function(){flowInput(p.label)}})});
   if(flow.products.length>8)q+=' (type part of its name to search)';
  }else q+=' Type its name or serial number and I will match it on the form.';
 }
 if(f.type==='select')f.options.forEach(function(o){chips.push({label:o.label,fn:function(){flowInput(o.label)}})});
 if(!f.required){q+=' (optional)';chips.push({label:'Skip',cls:'quiet',fn:function(){flowInput('skip')}})}
 if(prevVisible(i-1)>=0)chips.push({label:'← Back',cls:'quiet',fn:function(){flowInput('back')}});
 chips.push({label:'Cancel',cls:'quiet',fn:function(){flowInput('cancel')}});
 addMessage('('+pos+'/'+vis.length+') '+q,'assistant',null,null,chips);
}
function summary(){
 flow.stage='confirm';
 var lines=flow.form.fields.filter(function(f){return flow.answers[f.id]}).map(function(f){var a=flow.answers[f.id];return f.label+': '+(a.shown||a.v||a.hint)});
 addMessage('Here is what I have:\n\n'+lines.join('\n')+'\n\nShall I fill the form now? You can still edit anything on the form before submitting.','assistant',null,null,[
  {label:'✓ Fill the form',cls:'primary',fn:function(){flowInput('yes')}},
  {label:'↺ Start over',fn:function(){flowInput('start over')}},
  {label:'Cancel',cls:'quiet',fn:function(){flowInput('cancel')}}]);
}
function report(form,r){
 if(r.blocked){addMessage('Your account role cannot use this form (it is read-only for you), so I could not fill it.','assistant');return}
 var msg='Done — I filled '+r.filled+' field'+(r.filled===1?'':'s')+' (highlighted on the page). Please review everything and press '+form.submitLabel+' yourself.';
 if(r.missing.length)msg+='\n\nI could not fill: '+r.missing.join(', ')+'. Please set '+(r.missing.length>1?'these':'this')+' on the form.';
 if(form.after)msg+='\n\n'+form.after;
 addMessage(msg,'assistant',null,null,[{label:'Fill another form',fn:showMenu}]);
}
function finishFlow(){
 var key=flow.key,form=flow.form,answers=flow.answers;endFlow();
 var draft={form:key,answers:answers,ts:Date.now()};
 if(onPage(form.page)){addMessage('Filling the form…','assistant');applyDraft(draft).then(function(r){report(form,r)});return}
 try{sessionStorage.setItem(DRAFT_KEY,JSON.stringify(draft))}
 catch(e){addMessage('I could not pass your answers to the next page (browser storage is blocked). Please open the form and fill it manually.','assistant',form.page,form.title);return}
 addMessage('Opening the '+form.title+' page and filling it in…','assistant');
 setTimeout(function(){location.href=form.page},700);
}
function flowInput(text){
 var t=String(text||'').trim();if(!t||!flow)return;
 addMessage(t,'user');
 if(/^(cancel|stop|exit|quit|band)$/i.test(t))return cancelFlow();
 if(flow.stage==='confirm'){
  if(/^(yes|y|ok|okay|haan|han|ji|fill|confirm|done)/i.test(t))return finishFlow();
  if(/^(start over|restart|no|dobara|nahi)/i.test(t)){var k=flow.key;endFlow();return startForm(k)}
  addMessage('Please choose "Fill the form", "Start over" or "Cancel".','assistant');return summary();
 }
 var f=flow.form.fields[flow.i];
 if(/^(back|undo|wapas|pichla)$/i.test(t)){
  var p=prevVisible(flow.i-1);if(p<0){addMessage('This is the first question.','assistant');return ask()}
  flow.i=p;return ask();
 }
 if(/^(skip|chor do|chhor do)$/i.test(t)){
  if(f.required){addMessage('That one is required, so I cannot skip it.','assistant');return ask()}
  delete flow.answers[f.id];flow.i++;return ask();
 }
 if(f.type==='product'){
  var m=null;
  if(flow.products&&flow.products.length){
   var q=t.toLowerCase();
   m=flow.products.filter(function(x){return x.label.toLowerCase()===q})[0]||flow.products.filter(function(x){return x.label.toLowerCase().indexOf(q)>-1})[0]||null;
   if(!m){addMessage('I could not find that product. Pick one of the buttons or type part of its name.','assistant');return ask()}
   flow.answers[f.id]={v:m.id,shown:m.label};
  }else flow.answers[f.id]={hint:t,shown:t};
 }else{
  var r=parseAnswer(f,t);
  if(r.err){addMessage(r.err,'assistant');return ask()}
  flow.answers[f.id]={v:r.v,shown:r.shown||r.v};
 }
 flow.i++;ask();
}

/* ---------- intent detection ---------- */
function detectForm(t){
 if(/^(how|where|what|why|kaise|kahan|kya)\b/i.test(t))return null;
 if(!/\b(fill|form|bhar\w*|add|new|register|submit|file|log|create|start|enter|record)\b/i.test(t))return null;
 if(/repair|service record/i.test(t))return'repair';
 if(/claim/i.test(t))return'claim';
 if(/product|device/i.test(t))return'product';
 return /\b(form|fill|bhar\w*)\b/i.test(t)?'menu':null;
}
function answer(q){
 var text=q.trim();if(!text)return;addMessage(text,'user');
 var key=detectForm(text);
 if(key)return key==='menu'?showMenu():startForm(key);
 var found=destinations.find(function(d){return d.match.test(text)});
 if(found){
  var chips=found.form?[{label:'Fill the '+FORMS[found.form].title+' form with me',fn:function(){addMessage('Fill the '+FORMS[found.form].title+' form','user');startForm(found.form)}}]:null;
  addMessage(found.answer,'assistant',found.url,found.title,chips);
 }
 else if(/^(hi|hello|hey|salam|assalam)\b/i.test(text))addMessage('Hello! Ask me about claims, documents, warranty policies, repairs, products, or your account. I can also fill a form for you: just say "fill a form".','assistant');
 else addMessage('I can guide you to AssureX features and fill forms with you, but I do not have access to your private records or an AI answer service. Try asking about claims, warranties, products, documents, repairs, or reviews, or say "fill a form".','assistant');
}
shell.querySelector('#axChatForm').addEventListener('submit',function(e){e.preventDefault();var v=input.value;input.value='';if(flow)flowInput(v);else answer(v);input.focus()});
shell.querySelectorAll('[data-question]').forEach(function(btn){btn.addEventListener('click',function(){answer(btn.getAttribute('data-question'));input.focus()})});
shell.querySelectorAll('[data-start]').forEach(function(btn){btn.addEventListener('click',function(){addMessage('Fill a form','user');showMenu();input.focus()})});

/* ---------- apply a draft handed over from another page ---------- */
var raw=null;try{raw=sessionStorage.getItem(DRAFT_KEY)}catch(e){}
if(raw){
 var d=null;try{d=JSON.parse(raw)}catch(e){}
 var okDraft=d&&FORMS[d.form]&&Date.now()-d.ts<DRAFT_TTL;
 if(!okDraft){try{sessionStorage.removeItem(DRAFT_KEY)}catch(e){}}
 else if(onPage(FORMS[d.form].page)){
  try{sessionStorage.removeItem(DRAFT_KEY)}catch(e){}
  setOpen(true);addMessage('Filling the '+FORMS[d.form].title+' form with your answers…','assistant');
  applyDraft(d).then(function(r){report(FORMS[d.form],r)});
 }
}
}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
