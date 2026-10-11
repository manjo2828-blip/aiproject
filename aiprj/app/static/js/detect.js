/* detect page. Example response:
 * {"image":{"width":640,"height":480},"detections":[{"label":"person","label_ko":"사람","class_id":0,"score":0.91,"bbox":[12,30,200,410]}],
 *  "counts":{"person":3},"elapsed_ms":88} */
document.addEventListener('DOMContentLoaded', function () {
  var card = document.getElementById('result-card');
  var canvas = document.getElementById('cv');
  var chipsEl = document.getElementById('chips');
  var conf = document.getElementById('conf');
  var confOut = document.getElementById('conf-out');
  var state = { img: null, data: null, selected: null, hover: -1, seq: 0, boxes: [] };

  function nameOf(d) { return d.label_ko || d.label; }

  function redraw() {
    if (!state.img || !state.data) return;
    var ctx = AP.fitCanvas(canvas, state.img, state.data.image);
    var sel = state.selected;
    state.boxes = state.data.detections.map(function (d, i) {
      return {
        bbox: d.bbox,
        label: nameOf(d) + ' ' + AP.pct(d.score),
        color: AP.colorFor(d.label),
        dim: sel !== null && d.label !== sel,
        bold: i === state.hover && (sel === null || d.label === sel)
      };
    });
    AP.drawBoxes(ctx, state.boxes, {});
  }

  function renderChips() {
    AP.clear(chipsEl);
    var counts = state.data.counts || {};
    var labelKo = {};
    state.data.detections.forEach(function (d) { labelKo[d.label] = nameOf(d); });
    Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).forEach(function (k) {
      var chip = AP.el('button', { class: 'chip' + (state.selected === k ? ' active' : ''), type: 'button', style: '--c:' + AP.colorFor(k) }, [
        AP.el('span', { class: 'dot' }),
        document.createTextNode((labelKo[k] || k) + ' ' + counts[k])
      ]);
      chip.addEventListener('click', function () {
        state.selected = state.selected === k ? null : k;
        renderChips(); redraw();
      });
      chipsEl.appendChild(chip);
    });
  }

  function render() {
    var data = state.data;
    var n = data.detections.length;
    card.hidden = false;
    var total = document.getElementById('total');
    AP.clear(total);
    if (!n) {
      total.textContent = '아무것도 못 찾았어요 🫥 민감도를 낮춰 봐요';
      document.getElementById('comment').textContent = '숨은 그림이 꼭꼭 숨었네요!';
    } else {
      var num = AP.el('span', { class: 'num', text: '0' });
      total.appendChild(document.createTextNode('숨은 그림 '));
      total.appendChild(num);
      total.appendChild(document.createTextNode('개 찾았어요! 🔍'));
      AP.countUp(num, n, 700);
      document.getElementById('comment').textContent = '칩을 눌러서 하나만 골라볼까요?';
    }
    document.getElementById('meta').textContent = '추론 시간 ' + data.elapsed_ms + 'ms';
    renderChips();
    redraw();
  }

  async function run(file) {
    var my = ++state.seq;
    card.hidden = false;
    var res = await AP.safe(function () {
      return Promise.all([
        AP.postImage('/api/detect', file, { conf: conf.value }),
        state.imgFile === file && state.img ? state.img : AP.loadImage(file)
      ]);
    }, card);
    if (my !== state.seq) return;
    if (!res) { if (!state.data) card.hidden = true; return; }
    state.data = res[0]; state.img = res[1]; state.imgFile = file;
    state.selected = null; state.hover = -1;
    render();
  }

  var picker = AP.createImagePicker(document.getElementById('picker'), {
    onImage: function (file) { run(file); },
    onClear: function () { state.seq++; state.data = null; state.img = null; card.hidden = true; },
    samples: [
      { label: '🏙️ 거리', url: '/static/img/samples/street.jpg' },
      { label: '🛋️ 방', url: '/static/img/samples/room.jpg' },
      { label: '🐾 동물', url: '/static/img/samples/animals.jpg' }
    ],
    webcam: true
  });

  conf.addEventListener('input', function () { confOut.textContent = Number(conf.value).toFixed(2); });
  conf.addEventListener('change', function () {
    var f = picker.getFile();
    if (f) run(f);
  });

  canvas.addEventListener('mousemove', function (e) {
    if (!state.boxes.length) return;
    var i = AP.hitBox(canvas, e, state.boxes);
    if (i !== state.hover) { state.hover = i; redraw(); }
  });
  canvas.addEventListener('mouseleave', function () {
    if (state.hover !== -1) { state.hover = -1; redraw(); }
  });
});
