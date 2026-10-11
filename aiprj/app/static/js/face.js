/* face page: tab A detect, tab B compare.
 * /api/face/detect -> {image:{width,height}, faces:[{score,bbox,landmarks}], elapsed_ms}
 * /api/face/compare -> {a:{image,face,num_faces}, b:{...}, similarity_percent, same_person, ...}
 */
document.addEventListener('DOMContentLoaded', function () {
  var $ = function (id) { return document.getElementById(id); };

  // ---------- tabs ----------
  var tabs = { detect: $('tab-detect'), compare: $('tab-compare') };
  var panels = { detect: $('panel-detect'), compare: $('panel-compare') };
  function showTab(name) {
    Object.keys(tabs).forEach(function (k) {
      tabs[k].setAttribute('aria-selected', k === name ? 'true' : 'false');
      panels[k].hidden = k !== name;
    });
    try { history.replaceState(null, '', '#' + name); } catch (e) { /* ignore */ }
  }
  tabs.detect.addEventListener('click', function () { showTab('detect'); });
  tabs.compare.addEventListener('click', function () { showTab('compare'); });
  if (location.hash === '#compare') showTab('compare');

  var SAMPLES = [
    { label: '샘플 A', url: '/static/img/samples/face_a.jpg' },
    { label: '샘플 B', url: '/static/img/samples/face_b.jpg' }
  ];

  function drawLandmarks(ctx, canvas, face, color) {
    if (!face.landmarks) return;
    AP.drawPoints(ctx, face.landmarks, { color: color, radius: 4 });
  }

  // ---------- tab A: detect ----------
  var detectCard = $('detect-result');
  var detectSeq = 0;
  var detectPicker = AP.createImagePicker($('picker-detect'), {
    samples: SAMPLES,
    webcam: true,
    onImage: function (file) {
      var seq = ++detectSeq;
      runDetect(file, seq);
    },
    onClear: function () { detectSeq++; detectCard.hidden = true; }
  });

  async function runDetect(file, seq) {
    detectCard.hidden = false;
    var data = await AP.safe(async function () {
      var results = await Promise.all([AP.postImage('/api/face/detect', file), AP.loadImage(file)]);
      return { res: results[0], img: results[1] };
    }, detectCard);
    if (seq !== detectSeq) return;
    if (!data) { detectCard.hidden = true; return; }
    var res = data.res;
    var canvas = $('detect-canvas');
    var ctx = AP.fitCanvas(canvas, data.img, res.image);
    var faces = res.faces || [];
    var color = AP.colorFor('face');
    AP.drawBoxes(ctx, faces.map(function (f, i) {
      return { bbox: f.bbox, label: String(i + 1), color: color };
    }), { lineWidth: 3 });
    faces.forEach(function (f) { drawLandmarks(ctx, canvas, f, AP.cssVar ? AP.cssVar('--sun') : '#FFD93D'); });
    var c = $('detect-comment');
    c.textContent = faces.length
      ? '얼굴 ' + faces.length + '개 발견! 😎'
      : '얼굴이 안 보여요 🙈 정면 사진으로 다시 해볼까요?';
    detectCard.classList.remove('pop'); void detectCard.offsetWidth; detectCard.classList.add('pop');
  }

  // ---------- tab B: compare ----------
  var fileA = null, fileB = null;
  var btn = $('compare-btn');
  var cmpCard = $('compare-result');
  function updateBtn() { btn.disabled = !(fileA && fileB); }

  AP.createImagePicker($('picker-a'), {
    label: 'A', samples: [SAMPLES[0]], webcam: true,
    onImage: function (f) { fileA = f; updateBtn(); },
    onClear: function () { fileA = null; updateBtn(); }
  });
  AP.createImagePicker($('picker-b'), {
    label: 'B', samples: [SAMPLES[1]], webcam: true,
    onImage: function (f) { fileB = f; updateBtn(); },
    onClear: function () { fileB = null; updateBtn(); }
  });

  function verdict(p) {
    if (p >= 85) return '쌍둥이 아니세요?! 👯';
    if (p >= 65) return '가족이라고 해도 믿겠어요';
    if (p >= 40) return '어딘가 닮은 구석이…?';
    return '완전 다른 매력! ✨';
  }

  function drawSide(canvasId, img, side, label, noteId) {
    var canvas = $(canvasId);
    var ctx = AP.fitCanvas(canvas, img, side.image);
    var color = AP.colorFor(label);
    AP.drawBoxes(ctx, [{ bbox: side.face.bbox, label: label, color: color }], { lineWidth: 4, fontSize: 16 });
    drawLandmarks(ctx, canvas, side.face, AP.cssVar ? AP.cssVar('--sun') : '#FFD93D');
    $(noteId).textContent = side.num_faces > 1
      ? '얼굴이 ' + side.num_faces + '개라서 가장 큰 얼굴을 사용했어요'
      : '';
  }

  var busy = false;
  btn.addEventListener('click', async function () {
    if (busy || !(fileA && fileB)) return;
    busy = true; btn.disabled = true;
    var fa = fileA, fb = fileB;
    cmpCard.hidden = false;
    var data = await AP.safe(async function () {
      var r = await Promise.all([
        AP.postImages('/api/face/compare', { file_a: fa, file_b: fb }),
        AP.loadImage(fa), AP.loadImage(fb)
      ]);
      return { res: r[0], imgA: r[1], imgB: r[2] };
    }, cmpCard);
    busy = false; updateBtn();
    if (fa !== fileA || fb !== fileB) { cmpCard.hidden = true; return; } // inputs changed meanwhile
    if (!data) { cmpCard.hidden = true; return; }
    var res = data.res;
    drawSide('cmp-canvas-a', data.imgA, res.a, 'A', 'cmp-note-a');
    drawSide('cmp-canvas-b', data.imgB, res.b, 'B', 'cmp-note-b');
    var pct = Math.round(res.similarity_percent);
    AP.setGauge($('cmp-gauge'), pct, { color: AP.cssVar ? AP.cssVar('--grape') : undefined, countUp: true });
    var v = verdict(res.similarity_percent);
    $('cmp-verdict').textContent = v;
    $('cmp-comment').textContent = res.same_person
      ? '같은 사람일 가능성이 높아요! 🎉 (' + pct + '%)'
      : '닮은 정도는 ' + pct + '% 예요. ' + v;
    cmpCard.classList.remove('pop'); void cmpCard.offsetWidth; cmpCard.classList.add('pop');
    if (res.same_person) AP.confetti(20);
    cmpCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
});
