/* 홈: 모델 상태 배지 + 오늘의 한마디 */
document.addEventListener('DOMContentLoaded', function () {
  var quoteEl = document.getElementById('quote');
  var moreBtn = document.getElementById('quote-more');
  var last = null;
  function showQuote() {
    var q;
    do { q = AP.pick(AP.TIPS); } while (q === last && AP.TIPS.length > 1);
    last = q;
    quoteEl.textContent = q;
    quoteEl.classList.remove('pop');
    void quoteEl.offsetWidth;
    quoteEl.classList.add('pop');
  }
  showQuote();
  moreBtn.addEventListener('click', showQuote);

  var LABELS = {
    ready: ['준비됨', 'ready'],
    loading: ['예열 중', 'loading'],
    not_loaded: ['준비됨', 'ready'],
    error: ['점검 중', 'error']
  };

  AP.api('/api/models/status').then(function (res) {
    var models = (res && res.models) || {};
    document.querySelectorAll('.ride[data-model]').forEach(function (card) {
      var m = models[card.getAttribute('data-model')];
      var badge = card.querySelector('[data-badge]');
      if (!m || !badge) return;
      var info = LABELS[m.state] || LABELS.error;
      badge.textContent = info[0];
      badge.className = 'badge ' + info[1];
      badge.hidden = false;
      if (m.state === 'error' && m.error) badge.title = m.error;
    });
  }).catch(function () { /* 실패 시 배지는 숨김 유지 */ });
});
