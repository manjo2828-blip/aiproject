/* classify page. Example response:
 * {"image":{"width":640,"height":480},"predictions":[{"label":"tabby cat","label_ko":"얼룩 고양이","score":0.83}],"elapsed_ms":42} */
document.addEventListener('DOMContentLoaded', function () {
  var card = document.getElementById('result-card');
  var result = document.getElementById('result');
  var placeholder = document.getElementById('placeholder');
  var seq = 0;

  function commentFor(p) {
    var name = p.label_ko || p.label;
    if (p.score >= 0.7) return '100% 확실해요! 이건 ' + name + '!';
    if (p.score >= 0.3) return '음… ' + name + ' 같은데요? 🤔';
    return '저도 잘 모르겠어요 😵 (사진을 더 가까이!)';
  }

  function render(data) {
    var preds = data.predictions || [];
    if (!preds.length) { AP.toast('결과가 비었어요 🫥', 'error'); return; }
    var top = preds[0];
    placeholder.hidden = true;
    result.hidden = false;
    document.getElementById('top-label').textContent = '👑 ' + (top.label_ko || top.label);
    AP.renderBars(document.getElementById('bars'), preds.slice(0, 5).map(function (p, i) {
      return {
        label: p.label_ko ? p.label_ko + ' (' + p.label + ')' : p.label,
        value: p.score,
        badge: i === 0 ? '👑' : '',
        highlight: i === 0,
        color: i === 0 ? 'var(--accent)' : 'var(--muted)'
      };
    }), { max: 1, format: function (v) { return AP.pct(v, 1); } });
    document.getElementById('comment').textContent = commentFor(top);
    document.getElementById('meta').textContent = '추론 시간 ' + data.elapsed_ms + 'ms';
    result.classList.remove('pop'); void result.offsetWidth; result.classList.add('pop');
  }

  async function run(file) {
    var my = ++seq;
    var data = await AP.safe(function () { return AP.postImage('/api/classify', file, { top_k: 5 }); }, card);
    if (!data || my !== seq) return;
    render(data);
  }

  AP.createImagePicker(document.getElementById('picker'), {
    onImage: function (file) { run(file); },
    onClear: function () { seq++; result.hidden = true; placeholder.hidden = false; },
    samples: [
      { label: '🐱 고양이', url: '/static/img/samples/cat.jpg' },
      { label: '🐶 강아지', url: '/static/img/samples/dog.jpg' },
      { label: '🍕 피자', url: '/static/img/samples/pizza.jpg' },
      { label: '🚗 자동차', url: '/static/img/samples/car.jpg' }
    ],
    webcam: true,
    hint: '여기에 사진을 끌어놓거나 클릭! (Ctrl+V 붙여넣기도 OK)'
  });

  document.getElementById('fb-yes').addEventListener('click', function () { AP.toast('역시 제가 좀 하죠? 😎', 'success'); });
  document.getElementById('fb-no').addEventListener('click', function () { AP.toast('앗, 다음엔 더 잘 맞힐게요 🥲', 'info'); });
});
