/* Load OCR dependencies only on demand. No change to extraction or saved data. */
(function(){'use strict';
  var pending = Object.create(null);
  function load(url, test) {
    if(test()) return Promise.resolve();
    if(pending[url]) return pending[url];
    pending[url] = new Promise(function(resolve,reject){
      var script=document.createElement('script');script.src=url;script.async=true;
      script.onload=function(){test()?resolve():reject(new Error('OCR dependency unavailable.'))};
      script.onerror=function(){reject(new Error('OCR library could not be loaded. Check your connection.'))};
      document.head.appendChild(script);
    }).catch(function(error){delete pending[url];throw error});
    return pending[url];
  }
  window.AssureXLoadOCR=async function(type){
    await load('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',function(){return !!window.Tesseract});
    if(String(type||'').toLowerCase()==='application/pdf'){
      await load('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',function(){return !!window.pdfjsLib});
      window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  };
})();
