/* pose page. Example response:
 * {"image":{"width":640,"height":480},"keypoint_names":["nose",...17],"edges":[[0,1],...],
 *  "people":[{"score":0.88,"bbox":[0,0,1,1]|null,"keypoints":[{"x":1,"y":2,"score":0.9}, ...17]}],"elapsed_ms":120} */
document.addEventListener('DOMContentLoaded', function () {
  var MIN = 0.3;
  var card = document.getElementById('result-card');
  var canvas = document.getElementById('cv');
  var liveWrap = document.getElementById('live-wrap');
  var liveSlot = document.getElementById('live-slot');
  var live = document.getElementById('live');
  var seq = 0, busy = false, timer = null, liveStream = null;
  var VARS = ['--primary', '--sky', '--grape', '--mint', '--sun'];

  function personColor(i) {
    var v = AP.cssVar ? AP.cssVar(VARS[i % VARS.length]) : '';
    return v || AP.PALETTE[i % AP.PALETTE.length];
  }

  function guess(p, names) {
    if (p.guess && p.guess.label_ko) return p.guess.label_ko;
    return localGuess(p, names);
  }

  function localGuess(p, names) {
    names = names || p.keypoints.map(function (k) { return k.name; });
    function kp(n) { var k = p.keypoints[names.indexOf(n)]; return k && k.score >= MIN ? k : null; }
    var nose = kp('nose'), lw = kp('left_wrist'), rw = kp('right_wrist');
    if (!nose) return '얼굴이 가려졌어요 🙈';
    var l = lw && lw.y < nose.y, r = rw && rw.y < nose.y;
    if (l && r) return '만세! 🙌';
    if (l || r) return '손 흔들어요 👋';
    return '차렷 자세네요 🧍';
  }

  function render(data, img) {
    var names = data.keypoint_names, people = data.people || [];
    card.hidden = false;
    var ctx = AP.fitCanvas(canvas, img, data.image);
    people.forEach(function (p, i) {
      AP.drawSkeleton(ctx, p, { edges: data.edges, color: personColor(i), lineWidth: 4, radius: 6, minScore: MIN });
    });
    var list = document.getElementById('people');
    AP.clear(list);
    if (!people.length) {
      document.getElementById('count').textContent = '';
      document.getElementById('guess').textContent = '사람이 안 보여요 🫥';
      document.getElementById('comment').textContent = '전신이 나오게 조금 뒤로 물러나 볼까요?';
    } else {
      document.getElementById('count').textContent = people.length + '명 발견!';
      document.getElementById('guess').textContent = guess(people[0], names);
      document.getElementById('comment').textContent = '관절 점이 쏙쏙 잘 잡혔어요 ✨';
      people.forEach(function (p, i) {
        var shown = p.keypoints.filter(function (k) { return k.score >= MIN; }).length;
        list.appendChild(AP.el('li', {}, [
          AP.el('span', { class: 'swatch', style: 'background:' + personColor(i) }),
          AP.el('strong', { text: (i + 1) + '번 사람' }),
          AP.el('span', { text: guess(p, names) }),
          AP.el('span', { class: 'muted', text: '관절 ' + shown + '/' + p.keypoints.length + ' · 자신감 ' + AP.pct(p.score) })
        ]));
      });
    }
    document.getElementById('meta').textContent = '추론 시간 ' + data.elapsed_ms + 'ms';
  }

  var lastToast = 0, fails = 0, liveTok = 0;

  function liveError(e) {
    var now = Date.now();
    if (now - lastToast > 10000) { lastToast = now; AP.toast((e && e.message) || '포즈 분석에 실패했어요', 'error'); }
    if (++fails >= 3) {
      live.checked = false; stopLive();
      AP.toast('연속으로 실패해서 실시간 모드를 껐어요 🛑', 'error');
    }
  }

  async function run(file, silent) {
    var my = ++seq;
    busy = true;
    if (!silent) card.hidden = false;
    try {
      var res;
      if (silent) {
        try { res = await Promise.all([AP.postImage('/api/pose', file, { conf: 0.3 }), AP.loadImage(file)]); }
        catch (e) { if (my === seq) liveError(e); return; }
        fails = 0;
      } else {
        res = await AP.safe(function () {
          return Promise.all([AP.postImage('/api/pose', file, { conf: 0.3 }), AP.loadImage(file)]);
        }, card);
      }
      if (my !== seq) return;
      if (!res) { if (!silent) card.hidden = true; return; }
      render(res[0], res[1]);
    } finally { if (my === seq) busy = false; }
  }

  function stopLive() {
    liveTok++;
    if (timer) { clearInterval(timer); timer = null; }
    if (liveStream) { liveStream.getTracks().forEach(function (t) { t.stop(); }); liveStream = null; }
    AP.clear(liveSlot);
  }

  async function startLive() {
    stopLive();
    var tok = liveTok;
    fails = 0;
    var stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    } catch (e) {
      if (tok === liveTok) { AP.toast('웹캠을 쓸 수 없어요 😢', 'error'); live.checked = false; }
      return;
    }
    if (tok !== liveTok || !live.checked) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
    liveStream = stream;
    var video = AP.el('video', { id: 'live-video', autoplay: '', playsinline: '' });
    video.muted = true;
    video.srcObject = stream;
    liveSlot.appendChild(video);
    try { await video.play(); } catch (e) { /* autoplay may still work */ }
    if (tok !== liveTok) return;
    var grab = document.createElement('canvas');
    timer = setInterval(function () {
      if (tok !== liveTok || busy || document.hidden || !video.videoWidth) return;
      busy = true; // claim the slot until the frame is posted
      grab.width = video.videoWidth; grab.height = video.videoHeight;
      grab.getContext('2d').drawImage(video, 0, 0);
      grab.toBlob(function (b) {
        if (b && tok === liveTok && live.checked) run(new File([b], 'live.jpg', { type: 'image/jpeg' }), true);
        else busy = false;
      }, 'image/jpeg', 0.85);
    }, 1500);
  }

  AP.createImagePicker(document.getElementById('picker'), {
    onImage: function (file) { stopLive(); live.checked = false; run(file); },
    onClear: function () { seq++; busy = false; card.hidden = true; },
    samples: [
      { label: '💃 댄스', url: '/static/img/samples/dance.jpg' },
      { label: '🧘 요가', url: '/static/img/samples/yoga.jpg' }
    ],
    webcam: true,
    hint: '웹캠으로 직접 포즈를 취해봐요! 📷'
  });

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) liveWrap.hidden = false;
  live.addEventListener('change', function () { if (live.checked) startLive(); else stopLive(); });
  window.addEventListener('beforeunload', stopLive);
});
