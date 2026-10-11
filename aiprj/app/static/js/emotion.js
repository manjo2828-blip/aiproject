/* emotion page. POST /api/emotion {text} ->
 * {label, score, scores:[{label,score}], sentiment:-1..1, elapsed_ms}
 */
document.addEventListener('DOMContentLoaded', function () {
  var $ = function (id) { return document.getElementById(id); };
  var ta = $('emo-text'), btn = $('emo-btn'), counter = $('emo-counter');
  var card = $('emo-result');
  var MAX = 500;

  var EMOJI = {
    '기쁨': ['😄', 'var(--sun)'], '슬픔': ['😢', 'var(--sky)'], '분노': ['😡', 'var(--danger)'],
    '불안': ['😰', 'var(--grape)'], '상처': ['💔', 'var(--primary)'], '당황': ['😳', 'var(--mint)'],
    '중립': ['😐', 'var(--muted)']
  };
  function look(label) { return EMOJI[label] || ['🙂', 'var(--accent)']; }

  var SAMPLES = [
    '오늘 로또 맞았어!! 😆', '시험 망쳐서 너무 우울해…', '진짜 짜증나, 왜 이래?',
    '그냥 그저 그래요.', '무서워서 잠이 안 와요'
  ];

  function updateState() {
    var n = ta.value.length;
    counter.textContent = n + ' / ' + MAX;
    counter.style.color = n >= MAX ? 'var(--danger)' : '';
    btn.disabled = busy;
  }

  var busy = false;
  var samplesEl = $('emo-samples');
  SAMPLES.forEach(function (s) {
    var b = AP.el('button', { class: 'chip', text: s, type: 'button' });
    b.addEventListener('click', function () {
      ta.value = s; updateState(); ta.focus(); submit(true);
    });
    samplesEl.appendChild(b);
  });

  ta.addEventListener('input', updateState);
  ta.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
  });
  btn.addEventListener('click', submit);

  function moodText(s) {
    if (s >= 0.6) return '기분 최고! 🌞';
    if (s >= 0.2) return '꽤 좋은 기분이에요 🙂';
    if (s > -0.2) return '잔잔한 기분이에요 🌤️';
    if (s > -0.6) return '조금 가라앉았어요 ☁️';
    return '마음이 많이 힘들어 보여요 🌧️';
  }

  var seq = 0, hasResult = false, showAll = false, lastScores = null;

  // force=true: a sample chip was clicked; supersede any running request.
  async function submit(force) {
    var text = ta.value.trim();
    if (!text) { AP.toast('문장을 먼저 적어 주세요 ✍️', 'info'); ta.focus(); return; }
    if (busy && force !== true) return;
    var my = ++seq;
    busy = true; updateState();
    card.hidden = false;
    var res = await AP.safe(function () { return AP.api('/api/emotion', { method: 'POST', json: { text: text } }); }, card);
    if (my !== seq) return; // stale: a newer request owns the UI
    busy = false; updateState();
    if (!res) { if (!hasResult) card.hidden = true; return; }
    hasResult = true;
    render(res);
  }

  function render(res) {
    var lk = look(res.label);
    var emoji = $('emo-emoji');
    emoji.textContent = lk[0];
    emoji.classList.remove('bounce'); void emoji.offsetWidth; emoji.classList.add('bounce');
    $('emo-label').textContent = res.label + ' ' + AP.pct(res.score);

    var scores = (res.scores && res.scores.length ? res.scores : [{ label: res.label, score: res.score }]).slice();
    scores.sort(function (a, b) { return b.score - a.score; });
    lastScores = scores; showAll = false;
    renderScores();
    renderRest(res, lk);
  }

  function renderScores() {
    var scores = lastScores;
    var shown = scores.filter(function (s, i) { return showAll || i < 4 || s.score >= 0.01; });
    var more = $('emo-more');
    if (!more) {
      more = AP.el('button', { class: 'btn btn-ghost btn-sm', type: 'button', id: 'emo-more' });
      more.addEventListener('click', function () { showAll = !showAll; renderScores(); });
      $('emo-bars').parentNode.appendChild(more);
    }
    var low = scores.filter(function (x, i) { return i >= 4 && x.score < 0.01; }).length;
    more.hidden = low === 0;
    more.textContent = showAll ? '접기' : '더 보기 (' + low + ')';
    AP.renderBars($('emo-bars'), shown.map(function (s) {
      var i = scores.indexOf(s);
      var l = look(s.label);
      return { label: l[0] + ' ' + s.label, value: s.score, color: l[1], highlight: i === 0, badge: i === 0 ? '👑' : undefined };
    }), { max: 1, format: function (v) { return AP.pct(v); }, animate: true });
  }

  function renderRest(res, lk) {
    var sent = Math.max(-1, Math.min(1, Number(res.sentiment) || 0));
    var needle = $('emo-needle');
    needle.style.transform = 'rotate(-90deg)';
    void needle.getBoundingClientRect();
    requestAnimationFrame(function () { needle.style.transform = 'rotate(' + (sent * 90) + 'deg)'; });
    $('emo-mood-text').textContent = moodText(sent);

    var msg = res.label + ' 가득한 문장이네요! ' + lk[0];
    if (res.score < 0.4) msg += ' 감정이 섞여 있어요 🌈';
    $('emo-comment').textContent = msg;

    card.style.setProperty('--flash', lk[1]);
    card.classList.remove('flash', 'pop'); void card.offsetWidth; card.classList.add('flash', 'pop');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  updateState();
});
