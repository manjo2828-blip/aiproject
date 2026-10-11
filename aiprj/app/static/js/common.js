/* AI 놀이터 공통 헬퍼: window.AP  (레퍼런스: wiki/decisions/003-frontend-helpers.md) */
(function () {
  'use strict';

  var AP = {};
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- 기본 유틸 ---------- */
  AP.PALETTE = ['#FF6B6B', '#4ECDC4', '#5AA9FF', '#9B7BFF', '#FF9F43', '#2ECC71', '#E84393', '#00B8D9'];

  AP.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  AP.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  AP.debounce = function (fn, ms) {
    var t;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  };
  AP.pct = function (x, d) { return (x * 100).toFixed(d || 0) + '%'; };
  AP.cssVar = function (name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  };
  AP.clear = function (el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; };

  AP.el = function (tag, props, children) {
    var e = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style') e.setAttribute('style', v);
      else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  };

  AP.colorFor = function (key) {
    var s = String(key), h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return AP.PALETTE[h % AP.PALETTE.length];
  };

  /* ---------- 토스트 / 로딩 ---------- */
  AP.toast = function (msg, type, ms) {
    type = type || 'info';
    var root = document.getElementById('toast-root');
    if (!root) { root = AP.el('div', { id: 'toast-root' }); document.body.appendChild(root); }
    var icon = type === 'error' ? '🙈' : type === 'success' ? '🎉' : '💡';
    var t = AP.el('div', { class: 'toast toast-' + type, role: type === 'error' ? 'alert' : 'status' }, [
      AP.el('span', { class: 'toast-icon', text: icon }),
      AP.el('span', { text: String(msg == null ? '' : msg) })
    ]);
    root.appendChild(t);
    var close = function () {
      t.classList.add('out');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
    };
    t.addEventListener('click', close);
    setTimeout(close, ms || 3000);
    return t;
  };

  AP.setLoading = function (el, on) {
    if (!el) return;
    el.classList.toggle('is-loading', !!on);
    if (on) el.setAttribute('aria-busy', 'true'); else el.removeAttribute('aria-busy');
  };

  AP.countUp = function (el, to, ms, opts) {
    opts = opts || {};
    var d = opts.decimals || 0, suffix = opts.suffix || '';
    ms = ms == null ? 800 : ms;
    if (reduceMotion || ms <= 0) { el.textContent = Number(to).toFixed(d) + suffix; return; }
    var start = performance.now();
    function tick(now) {
      var p = Math.min(1, (now - start) / ms);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = (to * e).toFixed(d) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  };

  AP.confetti = function (n) {
    if (reduceMotion) return;
    n = n || 20;
    var wrap = AP.el('div', { class: 'confetti-wrap', 'aria-hidden': 'true' });
    var emojis = ['🎉', '✨', '🎊', '💖', '⭐'];
    for (var i = 0; i < n; i++) {
      wrap.appendChild(AP.el('span', {
        class: 'confetti',
        text: i % 3 === 0 ? '🎉' : AP.pick(emojis),
        style: 'left:' + (Math.random() * 100).toFixed(1) + '%;animation-delay:' +
          (Math.random() * 0.6).toFixed(2) + 's;animation-duration:' +
          (1.8 + Math.random() * 1.4).toFixed(2) + 's;font-size:' + (18 + Math.random() * 18).toFixed(0) + 'px'
      }));
    }
    document.body.appendChild(wrap);
    setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 4000);
  };

  /* ---------- 네트워크 ---------- */
  AP.api = function (path, opts) {
    opts = opts || {};
    var init = { method: opts.method || (opts.json || opts.formData ? 'POST' : 'GET'), headers: {} };
    if (opts.json !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.json);
    } else if (opts.formData) {
      init.body = opts.formData;
    }
    return fetch(path, init).then(function (res) {
      return res.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
        if (res.ok) return data;
        var err = data && data.error ? data.error : null;
        throw {
          code: (err && err.code) || 'HTTP_' + res.status,
          message: (err && err.message) || '앗, 문제가 생겼어요. 잠시 후 다시 해 주세요 🙏',
          status: res.status
        };
      });
    }, function () {
      throw { code: 'NETWORK_ERROR', message: '서버에 연결할 수 없어요. 잠시 후 다시 해 주세요 🔌', status: 0 };
    });
  };

  AP.loadImage = function (src) {
    return new Promise(function (resolve, reject) {
      var isBlob = typeof src !== 'string';
      var url = isBlob ? URL.createObjectURL(src) : src;
      var img = new Image();
      var release = function () { if (isBlob) URL.revokeObjectURL(url); };
      img.onload = function () { release(); resolve(img); };
      img.onerror = function () {
        release();
        reject({ code: 'INVALID_IMAGE', message: '이미지를 열 수 없어요 🖼️', status: 0 });
      };
      img.src = url;
    });
  };

  AP.resizeImage = function (file, maxSide) {
    maxSide = maxSide || 1280;
    return AP.loadImage(file).then(function (img) {
      var w = img.naturalWidth, h = img.naturalHeight;
      var longSide = Math.max(w, h);
      var isJpegPng = /^image\/(jpeg|png|webp)$/.test(file.type);
      if (longSide <= maxSide && isJpegPng) return file;
      var k = Math.min(1, maxSide / longSide);
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k));
      c.height = Math.max(1, Math.round(h * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return new Promise(function (resolve) {
        c.toBlob(function (blob) {
          if (!blob) { resolve(file); return; }
          var name = (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg';
          resolve(new File([blob], name, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.9);
      });
    }, function () { return file; });
  };

  AP.postImage = function (path, file, extra) {
    return AP.resizeImage(file, 1280).then(function (f) {
      var fd = new FormData();
      fd.append('file', f, f.name || 'image.jpg');
      Object.keys(extra || {}).forEach(function (k) {
        if (extra[k] != null) fd.append(k, extra[k]);
      });
      return AP.api(path, { method: 'POST', formData: fd });
    });
  };

  AP.postImages = function (path, files, extra) {
    var keys = Object.keys(files);
    return Promise.all(keys.map(function (k) { return AP.resizeImage(files[k], 1280); })).then(function (list) {
      var fd = new FormData();
      keys.forEach(function (k, i) { fd.append(k, list[i], list[i].name || (k + '.jpg')); });
      Object.keys(extra || {}).forEach(function (k) {
        if (extra[k] != null) fd.append(k, extra[k]);
      });
      return AP.api(path, { method: 'POST', formData: fd });
    });
  };

  /* AP.latest(key): 같은 key(보통 결과 카드 Element) 의 "최신 요청" 토큰.
     var t = AP.latest(card); ... await ...; if (!t.ok()) return;   // 더 새 요청이 있으면 false */
  var seqMap = new WeakMap();
  var seqFallback = {};
  function seqGet(key) {
    if (key && typeof key === 'object') return seqMap.get(key) || 0;
    return seqFallback[String(key)] || 0;
  }
  function seqSet(key, v) {
    if (key && typeof key === 'object') seqMap.set(key, v); else seqFallback[String(key)] = v;
  }
  AP.latest = function (key) {
    var my = seqGet(key) + 1;
    seqSet(key, my);
    return { id: my, ok: function () { return seqGet(key) === my; } };
  };

  var pendingMap = new WeakMap();

  /* AP.safe(fn, loadingEl): 예외 시 toast 후 null.
     loadingEl 이 있으면 카드별 진행 중 요청 수를 세어 마지막 요청이 끝날 때만 스피너를 끄고,
     더 새로운 요청에 밀린(superseded) 호출의 결과/에러는 버리고 null 을 돌려줌
     (기존의 `if (!data) return;` 패턴이 그대로 stale 결과를 무시함). */
  AP.safe = function (fn, loadingEl) {
    var tok = null;
    if (loadingEl) {
      tok = AP.latest(loadingEl);
      pendingMap.set(loadingEl, (pendingMap.get(loadingEl) || 0) + 1);
    }
    AP.setLoading(loadingEl, true);
    var done = function () {
      if (tok) {
        var n = Math.max(0, (pendingMap.get(loadingEl) || 1) - 1);
        pendingMap.set(loadingEl, n);
        if (n === 0) AP.setLoading(loadingEl, false);
      } else {
        AP.setLoading(loadingEl, false);
      }
    };
    var p;
    try { p = Promise.resolve(fn()); } catch (e) { p = Promise.reject(e); }
    return p.then(function (r) {
      done();
      return (tok && !tok.ok()) ? null : r;
    }, function (e) {
      done();
      if (tok && !tok.ok()) return null;
      AP.toast((e && e.message) || '앗, 문제가 생겼어요 🙈', 'error');
      return null;
    });
  };

  /* 스크린리더용 안내 (결과 요약 등): AP.announce('고양이 92%') */
  AP.announce = function (msg) {
    var r = document.getElementById('sr-live');
    if (!r) {
      r = AP.el('div', { id: 'sr-live', class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
      document.body.appendChild(r);
    }
    r.textContent = '';
    setTimeout(function () { r.textContent = String(msg == null ? '' : msg); }, 30);
  };

  /* ---------- 이미지 picker ---------- */
  var pickers = [];
  var activePicker = null;

  function fileFromBlob(blob, name) {
    return new File([blob], name, { type: blob.type || 'image/jpeg' });
  }

  var webcamOpen = false;

  function openWebcam(onFile, returnFocusEl) {
    if (webcamOpen) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      AP.toast('이 브라우저에서는 웹캠을 쓸 수 없어요 📷', 'error');
      return;
    }
    webcamOpen = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false })
      .then(function (stream) {
        var closed = false;
        var video = AP.el('video', { class: 'webcam-video', autoplay: true, playsinline: true, muted: true });
        video.muted = true; video.srcObject = stream;
        var shot = AP.el('button', { type: 'button', class: 'btn btn-primary', text: '📸 찰칵!' });
        var cancel = AP.el('button', { type: 'button', class: 'btn', text: '닫기' });
        var modal = AP.el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '웹캠' }, [
          AP.el('div', { class: 'modal-box card' }, [
            AP.el('h3', { class: 'card-title', text: '📷 웹캠으로 찍기' }),
            video,
            AP.el('div', { class: 'row center' }, [shot, cancel])
          ])
        ]);
        var onKey;
        var stop = function () {
          if (closed) return;
          closed = true;
          try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* ignore */ }
          video.srcObject = null;
          if (modal.parentNode) modal.parentNode.removeChild(modal);
          document.removeEventListener('keydown', onKey, true);
          window.removeEventListener('pagehide', stop);
          webcamOpen = false;
          if (returnFocusEl && returnFocusEl.focus) { try { returnFocusEl.focus(); } catch (e) { /* ignore */ } }
        };
        onKey = function (e) {
          if (e.key === 'Escape') { e.preventDefault(); stop(); return; }
          if (e.key === 'Tab') {
            var f = [shot, cancel];
            var idx = f.indexOf(document.activeElement);
            e.preventDefault();
            if (e.shiftKey) f[idx <= 0 ? f.length - 1 : idx - 1].focus();
            else f[idx < 0 || idx === f.length - 1 ? 0 : idx + 1].focus();
          }
        };
        shot.addEventListener('click', function () {
          if (!video.videoWidth) { AP.toast('카메라가 아직 준비 중이에요, 잠깐만요!', 'info'); return; }
          var c = document.createElement('canvas');
          c.width = video.videoWidth; c.height = video.videoHeight;
          c.getContext('2d').drawImage(video, 0, 0);
          c.toBlob(function (blob) {
            stop();
            if (blob) onFile(fileFromBlob(blob, 'webcam-' + Date.now() + '.jpg'));
          }, 'image/jpeg', 0.92);
        });
        cancel.addEventListener('click', stop);
        modal.addEventListener('click', function (e) { if (e.target === modal) stop(); });
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('pagehide', stop);
        document.body.appendChild(modal);
        shot.focus();
      })
      .catch(function () {
        webcamOpen = false;
        AP.toast('웹캠을 쓸 수 없어요. 권한을 허용했는지 확인해 주세요 🙏', 'error');
      });
  }

  AP.createImagePicker = function (rootEl, opts) {
    opts = opts || {};
    var current = null;
    var objectUrl = null;

    rootEl.classList.add('picker');
    AP.clear(rootEl);

    var fileInput = AP.el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/*', class: 'hidden', 'aria-label': '사진 파일 선택' });
    var icon = AP.el('div', { class: 'dropzone-icon', text: '🖼️' });
    var hint = AP.el('div', { class: 'dropzone-hint', text: opts.hint || '여기에 사진을 끌어놓거나 클릭해서 고르세요!' });
    var sub = AP.el('div', { class: 'dropzone-sub muted', text: 'Ctrl+V 로 붙여넣기도 돼요' });
    var thumb = AP.el('img', { class: 'dropzone-thumb hidden', alt: '선택한 사진 미리보기' });
    var dz = AP.el('div', { class: 'dropzone', tabindex: '0', role: 'button', 'aria-label': '사진 선택: 클릭하거나 Enter 키로 파일 고르기' }, [
      icon, hint, sub, thumb
    ]);
    if (opts.label) dz.appendChild(AP.el('span', { class: 'picker-label', text: opts.label }));

    var actions = AP.el('div', { class: 'picker-actions row' });
    var btnFile = AP.el('button', { type: 'button', class: 'btn btn-sm', text: '📁 파일 고르기' });
    actions.appendChild(btnFile);
    var btnCam = null;
    if (opts.webcam !== false && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      btnCam = AP.el('button', { type: 'button', class: 'btn btn-sm', text: '📷 웹캠으로 찍기' });
      actions.appendChild(btnCam);
    }
    var btnReset = AP.el('button', { type: 'button', class: 'btn btn-sm btn-ghost hidden', text: '↺ 다시 고르기' });
    actions.appendChild(btnReset);

    var samplesBox = AP.el('div', { class: 'picker-samples row hidden' });
    rootEl.appendChild(dz);
    rootEl.appendChild(actions);
    rootEl.appendChild(samplesBox);
    rootEl.appendChild(fileInput);

    function setFile(file) {
      if (!file) return;
      if (!/^image\//.test(file.type || '')) {
        AP.toast('이미지 파일만 올릴 수 있어요 🖼️', 'error');
        return;
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);
      current = file;
      thumb.src = objectUrl;
      thumb.classList.remove('hidden');
      dz.classList.add('has-image');
      btnReset.classList.remove('hidden');
      if (opts.onImage) opts.onImage(file, objectUrl);
    }

    function clear(silent) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null; current = null;
      thumb.removeAttribute('src');
      thumb.classList.add('hidden');
      dz.classList.remove('has-image');
      btnReset.classList.add('hidden');
      fileInput.value = '';
      if (!silent && opts.onClear) opts.onClear();
    }

    dz.addEventListener('click', function () { fileInput.click(); });
    dz.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });
    btnFile.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) setFile(fileInput.files[0]);
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('dragover'); });
    });
    dz.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) setFile(f);
    });
    if (btnCam) btnCam.addEventListener('click', function () { openWebcam(setFile, btnCam); });
    btnReset.addEventListener('click', function () { clear(false); });

    var api = {
      getFile: function () { return current; },
      setFile: setFile,
      clear: function () { clear(true); }
    };

    function activate() { activePicker = api; }
    rootEl.addEventListener('pointerenter', activate);
    rootEl.addEventListener('focusin', activate);
    rootEl.addEventListener('pointerdown', activate);
    pickers.push(api);
    if (!activePicker) activePicker = api;

    // 샘플 버튼 (파일이 없으면 자동 숨김)
    var samples = opts.samples || [];
    samples.forEach(function (s) {
      var b = AP.el('button', { type: 'button', class: 'chip sample-chip hidden', text: s.label });
      samplesBox.appendChild(b);
      var blobPromise = null;
      var getBlob = function () {
        if (!blobPromise) {
          blobPromise = fetch(s.url).then(function (r) {
            if (!r.ok) throw new Error('missing');
            return r.blob();
          });
        }
        return blobPromise;
      };
      getBlob().then(function (blob) {
        if (!/^image\//.test(blob.type || '')) throw new Error('not image');
        b.classList.remove('hidden');
        samplesBox.classList.remove('hidden');
        b.addEventListener('click', function () {
          var name = s.url.split('/').pop() || 'sample.jpg';
          setFile(fileFromBlob(blob, name));
        });
      }).catch(function () { /* 샘플 없음: 숨김 유지 */ });
    });
    if (samples.length) {
      var lbl = AP.el('span', { class: 'muted samples-label', text: '샘플로 놀아보기 →' });
      samplesBox.insertBefore(lbl, samplesBox.firstChild);
    }

    return api;
  };

  // 붙여넣기 (전역 1회)
  document.addEventListener('paste', function (e) {
    var target = activePicker || pickers[0];
    if (!target) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && /^image\//.test(items[i].type)) {
        var f = items[i].getAsFile();
        if (f) { e.preventDefault(); target.setFile(f); return; }
      }
    }
  });

  /* ---------- canvas 그리기 ---------- */
  /* 내부 px / CSS px 비율. 숨겨진(탭 전환 등) 캔버스는 clientWidth=0 이라 최대 600 css px 로 가정. */
  AP.canvasScale = function (canvas) {
    var w = canvas.clientWidth || (canvas.getBoundingClientRect && canvas.getBoundingClientRect().width) || 0;
    if (!w) w = Math.min(canvas.width || 600, 600);
    return Math.max(1, canvas.width / w);
  };

  /* 캔버스 CSS 폭이 바뀔 때(창 리사이즈/회전/탭 표시) redrawFn 호출. 해제 함수 반환.
     등록 즉시 호출하지 않음. 같은 canvas 에 다시 등록하면 이전 등록은 교체됨. */
  AP.onCanvasResize = function (canvas, redrawFn) {
    if (canvas.__apOff) canvas.__apOff();
    var last = canvas.clientWidth, raf = 0, ro = null;
    var run = function () {
      raf = 0;
      var w = canvas.clientWidth;
      if (w && w !== last) { last = w; try { redrawFn(); } catch (e) { /* ignore */ } }
      else if (w) last = w;
    };
    var sched = function () { if (!raf) raf = requestAnimationFrame(run); };
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(sched); ro.observe(canvas); }
    window.addEventListener('resize', sched);
    window.addEventListener('orientationchange', sched);
    var off = function () {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', sched);
      window.removeEventListener('orientationchange', sched);
      if (raf) cancelAnimationFrame(raf);
      canvas.__apOff = null;
    };
    canvas.__apOff = off;
    return off;
  };

  AP.fitCanvas = function (canvas, source, image) {
    var w = (image && image.width) || source.naturalWidth || source.width;
    var h = (image && image.height) || source.naturalHeight || source.height;
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (source) ctx.drawImage(source, 0, 0, w, h);
    return ctx;
  };

  function readableOn(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#fff';
    var n = parseInt(m[1], 16);
    var lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    return lum > 160 ? '#2B2A33' : '#fff';
  }

  AP.drawBoxes = function (ctx, boxes, opts) {
    opts = opts || {};
    var k = AP.canvasScale(ctx.canvas);
    var baseLw = Math.max(3, opts.lineWidth || 3) * k;   /* 최소 3 css px */
    var fs = Math.max(12, opts.fontSize || 14) * k;
    var halo = 2 * k;
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + fs + 'px "Noto Sans KR", sans-serif';
    ctx.lineJoin = 'round';
    (boxes || []).forEach(function (box, i) {
      var b = box.bbox || box;
      var x1 = b[0], y1 = b[1], w = b[2] - b[0], h = b[3] - b[1];
      var color = box.color ||
        (typeof opts.color === 'function' ? opts.color(box, i) : opts.color) || AP.cssVar('--primary') || '#FF6B6B';
      var label = box.label != null ? box.label : (opts.labelFn ? opts.labelFn(box, i) : '');
      ctx.globalAlpha = box.dim ? 0.25 : 1;
      var lw = box.bold ? baseLw * 1.9 : baseLw;
      /* 어두운 후광 위에 색 선: 어떤 배경에서도 또렷하게 */
      ctx.lineWidth = lw + halo * 2;
      ctx.strokeStyle = 'rgba(43,42,51,.85)';
      ctx.strokeRect(x1, y1, w, h);
      ctx.lineWidth = lw;
      ctx.strokeStyle = color;
      ctx.strokeRect(x1, y1, w, h);
      if (label) {
        var padX = 6 * k, ch = fs + 8 * k;
        var cw = ctx.measureText(label).width + padX * 2;
        var cy = y1 - ch;
        if (cy < 0) cy = y1;
        var cx = Math.min(Math.max(0, x1), Math.max(0, ctx.canvas.width - cw));
        ctx.fillStyle = color;
        ctx.fillRect(cx, cy, cw, ch);
        ctx.strokeStyle = AP.cssVar('--ink') || '#2B2A33';
        ctx.lineWidth = 1.5 * k;
        ctx.strokeRect(cx, cy, cw, ch);
        ctx.fillStyle = readableOn(color);
        ctx.fillText(label, cx + padX, cy + ch / 2 + 1);
      }
    });
    ctx.restore();
  };

  AP.hitBox = function (canvas, ev, boxes) {
    var r = canvas.getBoundingClientRect();
    var x = (ev.clientX - r.left) * (canvas.width / r.width);
    var y = (ev.clientY - r.top) * (canvas.height / r.height);
    var best = -1, bestArea = Infinity;
    (boxes || []).forEach(function (box, i) {
      var b = box.bbox || box;
      if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) {
        var a = (b[2] - b[0]) * (b[3] - b[1]);
        if (a < bestArea) { bestArea = a; best = i; }
      }
    });
    return best;
  };

  function ptXY(p) { return Array.isArray(p) ? { x: p[0], y: p[1], score: 1 } : { x: p.x, y: p.y, score: p.score == null ? 1 : p.score }; }

  AP.drawPoints = function (ctx, points, opts) {
    opts = opts || {};
    var k = AP.canvasScale(ctx.canvas);
    var r = Math.max(4, opts.radius || 5) * k;
    var min = opts.minScore || 0;
    ctx.save();
    ctx.fillStyle = opts.color || AP.cssVar('--accent') || '#4ECDC4';
    ctx.strokeStyle = AP.cssVar('--ink') || '#2B2A33';
    ctx.lineWidth = 1.5 * k;
    (points || []).forEach(function (p) {
      if (!p) return;
      var q = ptXY(p);
      if (q.score < min) return;
      ctx.beginPath();
      ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (opts.stroke !== false) ctx.stroke();
    });
    ctx.restore();
  };

  AP.drawSkeleton = function (ctx, person, opts) {
    opts = opts || {};
    var k = AP.canvasScale(ctx.canvas);
    var kps = person.keypoints || person;
    var min = opts.minScore == null ? 0.3 : opts.minScore;
    var color = opts.color || AP.cssVar('--accent') || '#4ECDC4';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(3, opts.lineWidth || 4) * k;
    ctx.lineCap = 'round';
    (opts.edges || []).forEach(function (e) {
      var a = kps[e[0]], b = kps[e[1]];
      if (!a || !b) return;
      var p = ptXY(a), q = ptXY(b);
      if (p.score < min || q.score < min) return;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    });
    ctx.restore();
    AP.drawPoints(ctx, kps, { color: color, radius: opts.radius || 6, minScore: min });
  };

  /* ---------- 막대 / 게이지 ---------- */
  AP.renderBars = function (container, items, opts) {
    opts = opts || {};
    var max = opts.max || 1;
    var fmt = opts.format || function (v) { return AP.pct(v, 1 * (v < 0.1 ? 1 : 0)); };
    var animate = opts.animate !== false && !reduceMotion;
    AP.clear(container);
    var wrap = AP.el('div', { class: 'bars' });
    var fills = [];
    (items || []).forEach(function (it, i) {
      var fill = AP.el('div', { class: 'bar-fill' });
      if (it.color) fill.style.setProperty('--c', it.color);
      var labelKids = [];
      if (it.badge) labelKids.push(AP.el('span', { class: 'bar-badge', text: it.badge }));
      labelKids.push(AP.el('span', { text: it.label }));
      var row = AP.el('div', { class: 'bar-row' + (it.highlight || (it.highlight === undefined && i === 0) ? ' top' : '') }, [
        AP.el('div', { class: 'bar-label' }, labelKids),
        AP.el('div', { class: 'bar-track' }, [fill]),
        AP.el('div', { class: 'bar-value', text: it.text != null ? it.text : fmt(it.value) })
      ]);
      wrap.appendChild(row);
      var w = Math.max(0, Math.min(100, (it.value / max) * 100));
      fills.push([fill, w]);
      fill.style.width = animate ? '0%' : w + '%';
    });
    container.appendChild(wrap);
    if (animate) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { fills.forEach(function (f) { f[0].style.width = f[1] + '%'; }); });
      });
    }
    return wrap;
  };

  AP.setGauge = function (el, percent, opts) {
    opts = opts || {};
    percent = Math.max(0, Math.min(100, percent));
    var num = el.querySelector('.gauge-num');
    if (!num) { num = AP.el('span', { class: 'gauge-num' }); el.appendChild(num); }
    if (opts.color) el.style.setProperty('--c', opts.color);
    el.style.setProperty('--pct', percent);
    if (opts.countUp === false) num.textContent = percent.toFixed(0) + '%';
    else AP.countUp(num, percent, 1000, { suffix: '%', decimals: 0 });
  };

  /* ---------- 상태 점 ---------- */
  AP.statusDots = function () {
    var dot = document.getElementById('status-dot');
    return AP.api('/api/health').then(function (h) {
      if (dot) { dot.classList.add('ok'); dot.title = '서버 정상 (v' + (h && h.version || '?') + ')'; }
      return true;
    }, function () {
      if (dot) { dot.classList.remove('ok'); dot.classList.add('off'); dot.title = '서버에 연결할 수 없어요'; }
      return false;
    });
  };

  AP.TIPS = [
    '사진을 더 가까이 찍으면 AI가 더 잘 맞혀요 📸',
    'AI도 가끔은 헷갈려요. 그래서 더 귀엽죠 🤖',
    '웹캠으로 찍으면 포즈 놀이가 두 배 재밌어요 🕺',
    '업로드한 사진은 서버에 저장되지 않아요 🔒',
    '문장 끝에 이모지를 붙이면 감정이 더 잘 보여요 😆',
    '밝은 곳에서 찍을수록 AI의 눈이 또렷해져요 💡',
    '친구랑 닮은꼴 %를 재 보세요. 결과는 책임 못 져요 👯',
    '오늘도 CPU는 열심히 달리는 중이에요 🐢'
  ];

  window.AP = AP;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', AP.statusDots);
  else AP.statusDots();
})();
