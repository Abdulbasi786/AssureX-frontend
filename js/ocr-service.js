/** AssureX structured OCR service. Browser-side OCR for stored PDF/image documents. */
(function(){
  'use strict';
  const IMAGE_TYPES=['image/jpeg','image/png'];
  const MAX_PDF_PAGES=10;
  const esc=v=>String(v??'').trim();
  function cleanText(t){return String(t||'').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();}
  function normalizeDate(value){
    const v=esc(value); if(!v)return '';
    let m=v.match(/\b(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/); if(m)return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    m=v.match(/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})\b/); if(m)return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    m=v.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/); if(m){const d=new Date(`${m[2]} ${m[1]}, ${m[3]}`);if(!isNaN(d))return d.toISOString().slice(0,10)}
    return '';
  }
  function firstMatch(text, patterns){for(const p of patterns){const m=text.match(p);if(m&&m[1])return esc(m[1]);}return '';}
  function amount(text){
    const raw=firstMatch(text,[/(?:total|grand\s+total|amount\s+paid|net\s+amount)\s*[:#-]?\s*(?:rs\.?|pkr|\$|€|£)?\s*([\d,]+(?:\.\d{1,2})?)/i,/(?:price|purchase\s+price|amount)\s*[:#-]?\s*(?:rs\.?|pkr|\$|€|£)?\s*([\d,]+(?:\.\d{1,2})?)/i]);
    if(!raw)return null; const n=Number(raw.replace(/,/g,'')); return Number.isFinite(n)?n:null;
  }
  function months(text){const raw=firstMatch(text,[/(?:warranty|guarantee)\s*(?:period|duration)?\s*[:#-]?\s*(\d{1,3})\s*(?:months?|mos?)/i,/(\d{1,3})\s*(?:months?|mos?)\s*(?:warranty|guarantee)/i]);return raw?Number(raw):null;}
  function extract(text,type){
    const t=cleanText(text), low=t.toLowerCase();
    const data={invoiceNumber:'',purchaseDate:'',productName:'',brand:'',modelNumber:'',serialNumber:'',retailer:'',purchaseAmount:null,warrantyMonths:null};
    data.invoiceNumber=firstMatch(t,[/(?:invoice|invoice\s*(?:no|number|#)|bill\s*(?:no|number|#))\s*[:#-]?\s*([A-Z0-9][A-Z0-9\/_-]{2,})/i]);
    data.purchaseDate=normalizeDate(firstMatch(t,[/(?:purchase|invoice|bill|date)\s*(?:date)?\s*[:#-]?\s*([0-9]{1,4}[-\/.][0-9]{1,2}[-\/.][0-9]{1,4}|[0-9]{1,2}\s+[A-Za-z]{3,9}\s+[0-9]{4})/i]));
    data.serialNumber=firstMatch(t,[/(?:serial|serial\s*(?:no|number|#)|s\/n)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\/_-]{3,})/i]);
    data.modelNumber=firstMatch(t,[/(?:model|model\s*(?:no|number|#))\s*[:#-]?\s*([A-Z0-9][A-Z0-9\/_ .-]{2,})/i]);
    data.brand=firstMatch(t,[/(?:brand|make)\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9 &.-]{1,50})/i]);
    data.retailer=firstMatch(t,[/(?:retailer|seller|vendor|sold\s+by|store|merchant)\s*[:#-]?\s*([^\n]{2,80})/i]);
    data.productName=firstMatch(t,[/(?:product|product\s+name|item|description)\s*[:#-]?\s*([^\n]{2,100})/i]);
    data.purchaseAmount=amount(t); data.warrantyMonths=months(t);
    if(type==='warranty_card'||low.includes('warranty')){
      if(!data.warrantyMonths){const m=t.match(/\b(\d{1,3})\s*(?:month|months|year|years)\b/i);if(m)data.warrantyMonths=/year/i.test(m[0])?Number(m[1])*12:Number(m[1]);}
    }
    return data;
  }
  async function imageFromBlob(blob){return await createImageBitmap(blob);}
  async function pdfSources(blob,onProgress){
    if(!window.pdfjsLib)throw new Error('PDF OCR library is not loaded.');
    const bytes=await blob.arrayBuffer(); const pdf=await window.pdfjsLib.getDocument({data:bytes}).promise; const count=Math.min(pdf.numPages,MAX_PDF_PAGES), out=[];
    for(let i=1;i<=count;i++){
      onProgress&&onProgress(`Rendering PDF page ${i} of ${count}…`);
      const page=await pdf.getPage(i), viewport=page.getViewport({scale:1.8}), canvas=document.createElement('canvas'); canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;out.push(canvas);
    }
    return {sources:out,pages:pdf.numPages,truncated:pdf.numPages>MAX_PDF_PAGES};
  }
  async function run(blob,meta,onProgress){
    if(!blob)throw new Error('No stored document content was found.');
    if(!window.Tesseract)throw new Error('Tesseract OCR library is not loaded.');
    const type=String(meta.fileType||blob.type||'').toLowerCase(), sources=[]; let pages=1,truncated=false;
    if(type==='application/pdf'||/\.pdf$/i.test(meta.fileName||'')){const p=await pdfSources(blob,onProgress);sources.push(...p.sources);pages=p.pages;truncated=p.truncated;}
    else if(IMAGE_TYPES.includes(type)){sources.push(await imageFromBlob(blob));}
    else throw new Error('OCR supports stored PDF, JPG/JPEG and PNG documents. Video and other files are preserved but not OCR-processed.');
    let raw='', total=0, count=0;
    for(let i=0;i<sources.length;i++){
      onProgress&&onProgress(`Recognizing text ${i+1} of ${sources.length}…`);
      const r=await window.Tesseract.recognize(sources[i],'eng',{logger:m=>{if(m.status==='recognizing text')onProgress&&onProgress(`OCR ${i+1}/${sources.length} — ${Math.round((m.progress||0)*100)}%`)}});
      const txt=cleanText(r.data.text);if(txt)raw+=(raw?'\n\n':'')+txt;total+=Number(r.data.confidence||0);count++;
    }
    if(!raw)throw new Error('OCR completed but no readable text was detected.');
    const structured=extract(raw,meta.documentType||'evidence');
    return {rawText:raw,structured,confidence:count?Math.round((total/count)*100)/100:0,pages,processedPages:sources.length,truncated,engine:'Tesseract.js',engineVersion:'5.x',processedAt:firebase.firestore.FieldValue.serverTimestamp()};
  }
  window.AssureXOCR={run,extract,normalizeDate};
})();
