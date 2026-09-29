/* AssureX — camera barcode / QR scanner for product registration.
 * Adds a scan button to the Serial Number and Model Number fields.
 * Chrome / Edge / Android use the built-in BarcodeDetector; other browsers load ZXing on demand.
 * A photo of the label can be uploaded instead when the camera is unavailable. */
(function () {
  'use strict';
  if (window.__axBarcodeScan) return;
  window.__axBarcodeScan = true;

  var TARGETS = [
    { id: 'serial_number', name: 'serial number' },
    { id: 'model_number', name: 'model number' }
  ];
  var ZX_URLS = [
    'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js',
    'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js',
    'https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/umd/index.min.js'
  ];
  var FORMAT_NAMES = {
    qr_code: 'QR code', code_128: 'Code 128', code_39: 'Code 39', code_93: 'Code 93',
    ean_13: 'EAN-13', ean_8: 'EAN-8', upc_a: 'UPC-A', upc_e: 'UPC-E', itf: 'ITF',
    codabar: 'Codabar', data_matrix: 'Data Matrix', pdf417: 'PDF417', aztec: 'Aztec'
  };
  var KEY_MAP = [
    [/^(serial(\s*(no|number|num))?|s\/n|sn|serial_number)$/i, 'serial_number'],
    [/^(model(\s*(no|number|num))?|model_number)$/i, 'model_number'],
    [/^(brand|make|manufacturer)$/i, 'brand'],
    [/^(product(\s*name)?|name|item)$/i, 'name']
  ];

  var overlay, panel, video, canvas, ctx, viewEl, statusEl, resultsEl, listEl, torchBtn, switchBtn, fileInput, titleEl;
  var stream = null, track = null, running = 0, target = null, lastFocus = null, devices = [], deviceIndex = 0, torchOn = false;
  var detector = null, zxReady = null;

  var ICON_SCAN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10"/></svg>';
  var ICON_TORCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>';
  var ICON_SWITCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7h-9a4 4 0 0 0-4 4v1M4 17h9a4 4 0 0 0 4-4v-1M17 4l3 3-3 3M7 20l-3-3 3-3"/></svg>';
  var ICON_IMAGE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 9"/></svg>';

  function ce(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function clean(v) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  }
  function niceFormat(f) {
    var k = String(f || '').toLowerCase();
    return FORMAT_NAMES[k] || (k ? k.replace(/_/g, ' ') : 'Barcode');
  }

  /* ---------- structured label text: JSON or "Serial: X / Model: Y" ---------- */
  function parseLabel(text) {
    var found = {}, count = 0, raw = String(text || '').trim();
    function put(k, v) {
      v = clean(v);
      if (!v) return;
      for (var i = 0; i < KEY_MAP.length; i++) {
        if (KEY_MAP[i][0].test(String(k).trim())) {
          var f = KEY_MAP[i][1];
          if (!found[f] && document.getElementById(f)) { found[f] = v; count++; }
          return;
        }
      }
    }
    if (raw.charAt(0) === '{') {
      try { var o = JSON.parse(raw); Object.keys(o).forEach(function (k) { if (typeof o[k] !== 'object') put(k, o[k]); }); } catch (e) { /* not JSON */ }
    } else {
      raw.split(/\r?\n|;|\|/).forEach(function (part) {
        var m = part.match(/^\s*([A-Za-z_\/ ]{1,20}?)\s*[:=]\s*(.+)$/);
        if (m) put(m[1], m[2]);
      });
    }
    return count ? found : null;
  }

  /* ---------- detector (native first, ZXing fallback) ---------- */
  function loadZXing() {
    if (window.ZXing) return Promise.resolve(true);
    if (zxReady) return zxReady;
    zxReady = new Promise(function (resolve) {
      var i = 0;
      (function next() {
        if (i >= ZX_URLS.length) { resolve(false); return; }
        var s = document.createElement('script');
        s.src = ZX_URLS[i++];
        s.async = true;
        s.onload = function () { window.ZXing ? resolve(true) : next(); };
        s.onerror = function () { s.remove(); next(); };
        document.head.appendChild(s);
      })();
    });
    return zxReady.then(function (ok) { if (!ok) zxReady = null; return ok; });
  }

  function getDetector() {
    if (detector) return Promise.resolve(detector);
    var chain = Promise.resolve(null);
    if ('BarcodeDetector' in window) {
      chain = (window.BarcodeDetector.getSupportedFormats ? window.BarcodeDetector.getSupportedFormats() : Promise.resolve([]))
        .then(function (sup) {
          var want = Object.keys(FORMAT_NAMES);
          var use = sup && sup.length ? want.filter(function (f) { return sup.indexOf(f) > -1; }) : want;
          if (!use.length) return null;
          var d = new window.BarcodeDetector({ formats: use });
          return {
            native: true,
            detect: function (src) {
              return d.detect(src).then(function (r) {
                return r.map(function (x) { return { rawValue: x.rawValue, format: x.format }; });
              });
            }
          };
        }).catch(function () { return null; });
    }
    return chain.then(function (d) {
      if (d) { detector = d; return d; }
      return loadZXing().then(function (ok) {
        if (!ok) return null;
        var Z = window.ZXing, hints = new Map();
        hints.set(Z.DecodeHintType.TRY_HARDER, true);
        hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [
          Z.BarcodeFormat.QR_CODE, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.CODE_93,
          Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E,
          Z.BarcodeFormat.ITF, Z.BarcodeFormat.CODABAR, Z.BarcodeFormat.DATA_MATRIX, Z.BarcodeFormat.PDF_417, Z.BarcodeFormat.AZTEC
        ]);
        var reader = new Z.MultiFormatReader();
        reader.setHints(hints);
        detector = {
          native: false,
          detect: function (src) {
            var c = src;
            if (src.tagName === 'VIDEO') { drawFrame(src, 960); c = canvas; }
            try {
              var bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(c)));
              var res = reader.decode(bmp);
              return Promise.resolve([{ rawValue: res.getText(), format: Z.BarcodeFormat[res.getBarcodeFormat()] }]);
            } catch (e) { return Promise.resolve([]); }
          }
        };
        return detector;
      });
    });
  }

  function drawFrame(src, maxW) {
    var w = src.videoWidth || src.naturalWidth || src.width, h = src.videoHeight || src.naturalHeight || src.height;
    if (!w || !h) return false;
    var s = Math.min(1, maxW / w);
    canvas.width = Math.round(w * s);
    canvas.height = Math.round(h * s);
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    return true;
  }

  /* ---------- modal ---------- */
  function build() {
    if (overlay) return;
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d', { willReadFrequently: true });

    overlay = ce('div', 'bs-overlay');
    overlay.hidden = true;
    panel = ce('div', 'bs-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'bsTitle');

    var head = ce('div', 'bs-head');
    var hl = ce('div');
    hl.appendChild(ce('div', 'bs-eyebrow', 'SCAN LABEL'));
    titleEl = ce('h2', 'bs-title', 'Scan serial number');
    titleEl.id = 'bsTitle';
    hl.appendChild(titleEl);
    var closeBtn = ce('button', 'bs-close', '×');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close scanner');
    closeBtn.addEventListener('click', close);
    head.append(hl, closeBtn);

    viewEl = ce('div', 'bs-view is-idle');
    video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.muted = true;
    video.setAttribute('aria-label', 'Camera preview');
    var frame = ce('div', 'bs-frame');
    frame.innerHTML = '<i></i><i></i><i></i><i></i>';
    var line = ce('div', 'bs-line');
    var empty = ce('div', 'bs-empty', 'Starting camera…');
    empty.id = 'bsEmpty';
    viewEl.append(video, frame, line, empty);

    statusEl = ce('p', 'bs-status');
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');

    var tools = ce('div', 'bs-tools');
    torchBtn = ce('button', 'bs-tool');
    torchBtn.type = 'button'; torchBtn.hidden = true;
    torchBtn.innerHTML = ICON_TORCH + '<span>Light</span>';
    torchBtn.setAttribute('aria-pressed', 'false');
    torchBtn.addEventListener('click', toggleTorch);
    switchBtn = ce('button', 'bs-tool');
    switchBtn.type = 'button'; switchBtn.hidden = true;
    switchBtn.innerHTML = ICON_SWITCH + '<span>Switch camera</span>';
    switchBtn.addEventListener('click', switchCamera);
    var upBtn = ce('button', 'bs-tool');
    upBtn.type = 'button';
    upBtn.innerHTML = ICON_IMAGE + '<span>Upload photo</span>';
    fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.hidden = true;
    upBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', onFile);
    tools.append(torchBtn, switchBtn, upBtn, fileInput);

    resultsEl = ce('div', 'bs-results');
    resultsEl.hidden = true;
    resultsEl.appendChild(ce('p', 'bs-results-title', 'DETECTED — TAP THE ONE YOU WANT'));
    listEl = ce('div', 'bs-results');
    resultsEl.appendChild(listEl);
    var actions = ce('div', 'bs-actions');
    var again = ce('button', 'bs-tool', 'Scan again');
    again.type = 'button';
    again.addEventListener('click', resume);
    actions.appendChild(again);
    resultsEl.appendChild(actions);

    var tip = ce('p', 'bs-tip', 'Hold the barcode or QR code inside the frame. Labels often carry several codes, so check the value before using it.');

    panel.append(head, viewEl, statusEl, tools, resultsEl, tip);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function (e) {
      if (overlay.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') {
        var f = Array.prototype.filter.call(panel.querySelectorAll('button,input,[tabindex]'), function (x) { return !x.hidden && !x.disabled && x.type !== 'file' && x.offsetParent !== null; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  function setStatus(msg, kind) {
    statusEl.textContent = msg || '';
    statusEl.className = 'bs-status' + (kind ? ' is-' + kind : '');
  }
  function setIdle(msg) {
    viewEl.classList.add('is-idle');
    viewEl.classList.remove('is-paused');
    var e = document.getElementById('bsEmpty');
    if (e) e.textContent = msg;
  }

  function open(fieldId) {
    build();
    target = TARGETS.filter(function (t) { return t.id === fieldId; })[0] || TARGETS[0];
    lastFocus = document.activeElement;
    titleEl.textContent = 'Scan ' + target.name;
    resultsEl.hidden = true;
    listEl.textContent = '';
    setStatus('');
    overlay.hidden = false;
    document.documentElement.classList.add('bs-lock');
    setIdle('Starting camera…');
    panel.querySelector('.bs-close').focus();
    startCamera();
  }

  function close() {
    running++;
    stopStream();
    if (overlay) overlay.hidden = true;
    document.documentElement.classList.remove('bs-lock');
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* ignore */ } }
  }

  function stopStream() {
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null; track = null; torchOn = false;
    if (video) { video.pause(); video.srcObject = null; }
    if (torchBtn) { torchBtn.hidden = true; torchBtn.setAttribute('aria-pressed', 'false'); }
  }

  /* ---------- camera ---------- */
  function startCamera() {
    var token = ++running;
    stopStream();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || window.isSecureContext === false) {
      setIdle('Live camera needs HTTPS or localhost. Use “Upload photo” to scan a picture of the label instead.');
      setStatus('Camera unavailable on this connection.', 'error');
      return;
    }
    var constraints = { audio: false, video: devices.length && devices[deviceIndex] && devices[deviceIndex].deviceId
      ? { deviceId: { exact: devices[deviceIndex].deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } };
    getDetector().then(function (d) {
      if (token !== running) return null;
      if (!d) {
        setIdle('Scanning is not supported in this browser. Type the value manually or try Chrome / Edge.');
        setStatus('Barcode scanner could not be loaded.', 'error');
        return null;
      }
      return navigator.mediaDevices.getUserMedia(constraints).then(function (s) {
        if (token !== running) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
        stream = s;
        track = s.getVideoTracks()[0];
        video.srcObject = s;
        return video.play().then(function () {
          if (token !== running) return;
          viewEl.classList.remove('is-idle', 'is-paused');
          setStatus('Point the camera at the barcode or QR code…');
          setupControls();
          loop(token);
        });
      });
    }).catch(function (err) {
      if (token !== running) return;
      var n = err && err.name;
      if (n === 'NotAllowedError' || n === 'SecurityError') {
        setIdle('Camera permission is blocked. Allow camera access in your browser settings, or use “Upload photo”.');
      } else if (n === 'NotFoundError' || n === 'OverconstrainedError') {
        setIdle('No camera was found on this device. Use “Upload photo” to scan a picture of the label.');
      } else {
        setIdle('The camera could not be started. Use “Upload photo” instead.');
      }
      setStatus('Camera unavailable.', 'error');
    });
  }

  function setupControls() {
    var caps = {};
    try { caps = track && track.getCapabilities ? track.getCapabilities() : {}; } catch (e) { /* ignore */ }
    torchBtn.hidden = !caps.torch;
    if (navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(function (all) {
        devices = all.filter(function (d) { return d.kind === 'videoinput'; });
        var cur = track && track.getSettings ? track.getSettings().deviceId : null;
        var idx = devices.findIndex(function (d) { return d.deviceId === cur; });
        if (idx > -1) deviceIndex = idx;
        switchBtn.hidden = devices.length < 2;
      }).catch(function () { /* ignore */ });
    }
  }

  function toggleTorch() {
    if (!track) return;
    torchOn = !torchOn;
    track.applyConstraints({ advanced: [{ torch: torchOn }] }).then(function () {
      torchBtn.setAttribute('aria-pressed', String(torchOn));
    }).catch(function () {
      torchOn = false;
      torchBtn.hidden = true;
    });
  }

  function switchCamera() {
    if (devices.length < 2) return;
    deviceIndex = (deviceIndex + 1) % devices.length;
    resultsEl.hidden = true;
    setIdle('Switching camera…');
    startCamera();
  }

  /* ---------- scan loop ---------- */
  function loop(token) {
    if (token !== running || !stream) return;
    var d = detector;
    if (video.readyState < 2) { setTimeout(function () { loop(token); }, 120); return; }
    Promise.resolve(d.detect(video)).then(function (found) {
      if (token !== running) return;
      var vals = [];
      (found || []).forEach(function (f) {
        var v = clean(f.rawValue);
        if (v && !vals.some(function (x) { return x.value === v; })) vals.push({ value: v, format: f.format, raw: f.rawValue });
      });
      if (vals.length) { onDetected(vals); return; }
      setTimeout(function () { loop(token); }, d.native ? 110 : 160);
    }).catch(function () {
      if (token === running) setTimeout(function () { loop(token); }, 250);
    });
  }

  function onDetected(list) {
    running++;
    if (video) video.pause();
    viewEl.classList.add('is-paused');
    if (navigator.vibrate) { try { navigator.vibrate(35); } catch (e) { /* ignore */ } }
    showResults(list);
  }

  function resume() {
    resultsEl.hidden = true;
    listEl.textContent = '';
    if (stream) {
      viewEl.classList.remove('is-paused');
      setStatus('Point the camera at the barcode or QR code…');
      video.play().then(function () { loop(++running); });
    } else {
      startCamera();
    }
  }

  function showResults(list) {
    listEl.textContent = '';
    list.forEach(function (item) {
      var fields = parseLabel(item.raw || item.value);
      var b = ce('button', 'bs-cand' + (fields ? ' is-label' : ''));
      b.type = 'button';
      if (fields) {
        var names = { serial_number: 'Serial', model_number: 'Model', brand: 'Brand', name: 'Name' };
        var parts = Object.keys(fields).map(function (k) { return names[k] + ': ' + fields[k]; });
        b.appendChild(ce('strong', '', parts.join('  ·  ')));
        b.appendChild(ce('span', '', 'Label data · fills ' + parts.length + (parts.length > 1 ? ' fields' : ' field') + ' · ' + niceFormat(item.format)));
        b.addEventListener('click', function () { applyFields(fields, niceFormat(item.format)); });
      } else {
        b.appendChild(ce('strong', '', item.value));
        b.appendChild(ce('span', '', 'Use as ' + target.name + ' · ' + niceFormat(item.format)));
        b.addEventListener('click', function () { applyFields((function () { var o = {}; o[target.id] = item.value; return o; })(), niceFormat(item.format)); });
      }
      listEl.appendChild(b);
    });
    resultsEl.hidden = false;
    setStatus(list.length > 1 ? list.length + ' codes found.' : 'Code found.', 'ok');
    var first = listEl.querySelector('.bs-cand');
    if (first) first.focus();
  }

  /* ---------- upload a photo ---------- */
  function onFile() {
    var f = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!f) return;
    running++;
    stopStream();
    resultsEl.hidden = true;
    setIdle('Reading photo…');
    setStatus('Reading barcode from photo…');
    var url = URL.createObjectURL(f), img = new Image();
    img.onload = function () {
      getDetector().then(function (d) {
        if (!d) { setStatus('Barcode scanner could not be loaded in this browser.', 'error'); return; }
        var sizes = [1600, 1000, 640], i = 0;
        (function attempt() {
          if (i >= sizes.length) {
            setIdle('No barcode found in that photo.');
            setStatus('No barcode found. Try a closer, sharper photo with good light.', 'error');
            return;
          }
          drawFrame(img, sizes[i++]);
          Promise.resolve(d.detect(canvas)).then(function (found) {
            var vals = [];
            (found || []).forEach(function (x) {
              var v = clean(x.rawValue);
              if (v && !vals.some(function (y) { return y.value === v; })) vals.push({ value: v, format: x.format, raw: x.rawValue });
            });
            if (vals.length) { setIdle('Photo scanned.'); showResults(vals); } else attempt();
          }).catch(attempt);
        })();
      }).then(function () { URL.revokeObjectURL(url); });
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      setIdle('That file could not be read as an image.');
      setStatus('Choose a JPG or PNG photo.', 'error');
    };
    img.src = url;
  }

  /* ---------- write into the form ---------- */
  function applyFields(fields, fmt) {
    var filled = [];
    Object.keys(fields).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.readOnly || el.disabled) return;
      el.value = fields[id];
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.classList.remove('bs-flash');
      void el.offsetWidth;
      el.classList.add('bs-flash');
      hint(el, 'Filled from scan (' + fmt + ') — please verify.');
      filled.push(id);
    });
    close();
    var focusEl = document.getElementById(filled[0] || target.id);
    if (focusEl && focusEl.focus) { try { focusEl.focus({ preventScroll: false }); } catch (e) { /* ignore */ } }
  }

  function hint(input, text) {
    var label = input.closest('label') || input.parentElement;
    var h = label.querySelector('.bs-hint');
    if (!h) { h = ce('small', 'bs-hint'); label.appendChild(h); }
    h.textContent = text;
    h.hidden = false;
    var clear = function () { h.hidden = true; input.removeEventListener('input', clear); };
    setTimeout(function () { input.addEventListener('input', clear); }, 0);
  }

  /* ---------- attach buttons ---------- */
  function attach() {
    TARGETS.forEach(function (t) {
      var input = document.getElementById(t.id);
      if (!input || input.dataset.bsReady || input.type === 'hidden') return;
      input.dataset.bsReady = '1';
      var wrap = ce('div', 'bs-field');
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      input.classList.add('bs-input');
      var btn = ce('button', 'bs-open');
      btn.type = 'button';
      btn.innerHTML = ICON_SCAN;
      btn.title = 'Scan ' + t.name + ' with camera';
      btn.setAttribute('aria-label', 'Scan ' + t.name + ' with camera');
      btn.addEventListener('click', function (e) { e.preventDefault(); open(t.id); });
      wrap.appendChild(btn);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
  window.AssureXScan = { open: open, close: close, parse: parseLabel };
})();
