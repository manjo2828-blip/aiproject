(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var app = $('app'), thread = $('thread'), scrollEl = $('scroll'), input = $('input'),
      sendBtn = $('send'), form = $('form'), historyEl = $('history'), searchEl = $('search');
  var KEY = 'rag_chats_v1', THEME = 'rag_theme';
  var chats = [], current = null, loading = false, ctrl = null, typingTimer = null;

  var ICON_SEND = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  var ICON_STOP = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="3"/></svg>';
  var ICON_COPY = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/></svg>';
  var ICON_CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';
  var ICON_UP = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 012 2v4h6a2 2 0 012 2.3l-1.2 7a2 2 0 01-2 1.7H7"/></svg>';
  var ICON_DOWN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(180deg)"><path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 012 2v4h6a2 2 0 012 2.3l-1.2 7a2 2 0 01-2 1.7H7"/></svg>';

  /* ---------- storage ---------- */
  function load() { try { chats = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { chats = []; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(chats)); } catch (e) {} }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------- theme ---------- */
  var SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
  var MOON = '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>';
  function systemDark() { return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches; }
  function applyTheme() {
    var t = null; try { t = localStorage.getItem(THEME); } catch (e) {}
    var dark = t ? t === 'dark' : systemDark();
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    $('themeIcon').innerHTML = dark ? SUN : MOON;
    $('themeLabel').textContent = dark ? '라이트 모드' : '다크 모드';
  }
  $('themeToggle').onclick = function () {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    try { localStorage.setItem(THEME, dark ? 'light' : 'dark'); } catch (e) {}
    applyTheme();
  };
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    var t = null; try { t = localStorage.getItem(THEME); } catch (e) {}
    if (!t) applyTheme();
  });

  /* ---------- sidebar ---------- */
  function setSide(open) { app.classList.toggle('collapsed', !open); }
  $('closeSide').onclick = function () { setSide(false); };
  $('openSide').onclick = function () { setSide(true); };
  $('backdrop').onclick = function () { setSide(false); };
  if (window.innerWidth <= 768) setSide(false);

  function renderHistory() {
    var q = searchEl.value.trim().toLowerCase();
    historyEl.innerHTML = '';
    chats.slice().sort(function (a, b) { return b.updated - a.updated; }).forEach(function (c) {
      if (q && c.title.toLowerCase().indexOf(q) < 0) return;
      var row = document.createElement('div');
      row.className = 'h-item' + (current && current.id === c.id ? ' active' : '');
      var t = document.createElement('div'); t.className = 'h-title'; t.textContent = c.title;
      var act = document.createElement('div'); act.className = 'h-act';
      var ren = document.createElement('button'); ren.textContent = '✎'; ren.title = '이름 바꾸기';
      var del = document.createElement('button'); del.textContent = '✕'; del.title = '삭제';
      act.appendChild(ren); act.appendChild(del);
      row.appendChild(t); row.appendChild(act);
      row.onclick = function () { openChat(c.id); if (window.innerWidth <= 768) setSide(false); };
      del.onclick = function (e) { e.stopPropagation(); if (!confirm('이 채팅을 삭제할까요?')) return;
        chats = chats.filter(function (x) { return x.id !== c.id; }); save();
        if (current && current.id === c.id) newChat(); else renderHistory(); };
      ren.onclick = function (e) {
        e.stopPropagation();
        var inp = document.createElement('input'); inp.value = c.title;
        t.textContent = ''; t.appendChild(inp); inp.focus(); inp.select();
        inp.onclick = function (ev) { ev.stopPropagation(); };
        var done = function (ok) { if (ok && inp.value.trim()) { c.title = inp.value.trim(); save(); } renderHistory(); };
        inp.onkeydown = function (ev) { if (ev.isComposing) return; if (ev.key === 'Enter') done(true); else if (ev.key === 'Escape') done(false); };
        inp.onblur = function () { done(true); };
      };
      historyEl.appendChild(row);
    });
  }
  searchEl.oninput = renderHistory;

  /* ---------- markdown ---------- */
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function inline(s) {
    var codes = [];
    s = s.replace(/`([^`\n]+)`/g, function (m, c) { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    s = esc(s).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\s][^*\n]*?)\*(?!\*)/g, '$1<em>$2</em>');
    return s.replace(/\u0000(\d+)\u0000/g, function (m, i) { return '<code>' + esc(codes[+i]) + '</code>'; });
  }
  function md(src) {
    var blocks = [];
    src = String(src).replace(/\r\n/g, '\n').replace(/```([^\n`]*)\n([\s\S]*?)(```|$)/g, function (m, lang, code) {
      blocks.push({ lang: lang.trim(), code: code.replace(/\n$/, '') });
      return '\n\u0001' + (blocks.length - 1) + '\u0001\n';
    });
    var lines = src.split('\n'), out = [], para = [], list = null;
    function flushP() { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } }
    function flushL() { if (list) { out.push('<' + list.t + '>' + list.items.map(function (i) { return '<li>' + inline(i) + '</li>'; }).join('') + '</' + list.t + '>'); list = null; } }
    lines.forEach(function (ln) {
      var m;
      if ((m = ln.match(/^\u0001(\d+)\u0001$/))) {
        flushP(); flushL();
        var b = blocks[+m[1]];
        out.push('<div class="codeblock"><div class="chead"><span>' + esc(b.lang || 'code') + '</span><button type="button" data-copy="1">코드 복사</button></div><pre><code>' + esc(b.code) + '</code></pre></div>');
      } else if ((m = ln.match(/^(#{1,4})\s+(.*)$/))) {
        flushP(); flushL(); out.push('<h' + m[1].length + '>' + inline(m[2]) + '</h' + m[1].length + '>');
      } else if ((m = ln.match(/^\s*[-*+]\s+(.*)$/))) {
        flushP(); if (!list || list.t !== 'ul') { flushL(); list = { t: 'ul', items: [] }; } list.items.push(m[1]);
      } else if ((m = ln.match(/^\s*\d+[.)]\s+(.*)$/))) {
        flushP(); if (!list || list.t !== 'ol') { flushL(); list = { t: 'ol', items: [] }; } list.items.push(m[1]);
      } else if (!ln.trim()) { flushP(); flushL(); }
      else { flushL(); para.push(ln); }
    });
    flushP(); flushL();
    return out.join('');
  }
  function copyText(text, btn, restore) {
    var done = function () { if (btn) { btn.innerHTML = ICON_CHECK; setTimeout(function () { btn.innerHTML = restore; }, 1500); } };
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done, fallback); }
    else fallback();
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); done();
    }
  }
  thread.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-copy]');
    if (!b) return;
    var code = b.closest('.codeblock').querySelector('code').textContent;
    var old = b.textContent;
    var done = function () { b.textContent = '복사됨'; setTimeout(function () { b.textContent = old; }, 1500); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(code).then(done);
    else { var ta = document.createElement('textarea'); ta.value = code; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (er) {} ta.remove(); done(); }
  });

  /* ---------- rendering ---------- */
  function toBottom() { scrollEl.scrollTop = scrollEl.scrollHeight; }
  function addUser(text) {
    var d = document.createElement('div'); d.className = 'msg user';
    var b = document.createElement('div'); b.className = 'bubble'; b.textContent = text;
    d.appendChild(b); thread.appendChild(d); return d;
  }
  // ---------- 출처 원문 모달 ----------
  function openSource(sources, idx) {
    var old = document.getElementById('src-modal'); if (old) old.remove();
    var s = sources[idx];
    var ov = document.createElement('div'); ov.id = 'src-modal'; ov.className = 'modal-ov';
    var box = document.createElement('div'); box.className = 'modal'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    var head = document.createElement('div'); head.className = 'modal-head';
    var h = document.createElement('div'); h.className = 'modal-title';
    h.innerHTML = '<small>출처 ' + (idx + 1) + ' / ' + sources.length + '</small><b></b>'; h.lastChild.textContent = String(s.title || '').replace(/^\[|\]$/g, '');
    var x = document.createElement('button'); x.type = 'button'; x.className = 'icon-btn'; x.title = '닫기'; x.textContent = '✕';
    head.appendChild(h); head.appendChild(x);
    var body = document.createElement('div'); body.className = 'modal-body';
    var text = String(s.text || '').replace(/^\[[^\]\n]*\]\n/, '');
    var hl = findRange(text, s.matched), first = null, off = 0;
    text.split(/\n{2,}/).forEach(function (para) {
      var start = text.indexOf(para, off); off = start + para.length;
      if (!para.trim()) return;
      var p = document.createElement('p'); if (/^["“'‘]/.test(para.trim())) p.className = 'quote';
      var a = hl ? Math.max(hl[0], start) : 0, b = hl ? Math.min(hl[1], off) : 0;
      if (hl && a < b) {
        p.appendChild(document.createTextNode(text.slice(start, a)));
        var m = document.createElement('mark'); m.textContent = text.slice(a, b); p.appendChild(m); if (!first) first = m;
        p.appendChild(document.createTextNode(text.slice(b, off)));
      } else p.textContent = para;
      body.appendChild(p);
    });    var meta = document.createElement('div'); meta.className = 'modal-meta';
    var bits = []; if (typeof s.score === 'number') bits.push('하이브리드 점수 ' + s.score.toFixed(3));
    if (typeof s.bm25 === 'number') bits.push('BM25 ' + s.bm25.toFixed(2)); if (typeof s.vector === 'number') bits.push('벡터 ' + s.vector.toFixed(3));
    meta.textContent = (hl ? '하늘색 밑줄 = 검색에 가장 잘 맞은 구절 · ' : '') + bits.join(' · ');
    box.appendChild(head); box.appendChild(body); box.appendChild(meta); ov.appendChild(box); document.body.appendChild(ov);
    function close() { ov.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    x.onclick = close; ov.onclick = function (e) { if (e.target === ov) close(); }; document.addEventListener('keydown', onKey);
    if (first) first.scrollIntoView({ block: 'center' });
  }
  // 공백 차이를 무시하고 부분 문자열의 [시작, 끝) 위치를 찾는다
  function findRange(text, sub) {
    if (!sub) return null;
    var map = [], flat = '';
    for (var i = 0; i < text.length; i++) if (!/\s/.test(text[i])) { map.push(i); flat += text[i]; }
    var needle = String(sub).replace(/\s+/g, ''); if (!needle) return null;
    var at = flat.indexOf(needle); if (at < 0) return null;
    return [map[at], map[at + needle.length - 1] + 1];
  }
  function addAssistant(text, sources, isErr, animate) {
    var d = document.createElement('div'); d.className = 'msg assistant' + (isErr ? ' err' : '');
    var c = document.createElement('div'); c.className = 'content'; d.appendChild(c);
    thread.appendChild(d);
    var finish = function () {
      c.innerHTML = md(text);
      if (!isErr) {
        var a = document.createElement('div'); a.className = 'actions';
        a.innerHTML = '<button type="button" title="복사" data-a="copy">' + ICON_COPY + '</button><button type="button" title="좋아요" data-a="up">' + ICON_UP + '</button><button type="button" title="싫어요" data-a="down">' + ICON_DOWN + '</button>';
        a.onclick = function (e) {
          var b = e.target.closest('button'); if (!b) return;
          if (b.dataset.a === 'copy') copyText(text, b, ICON_COPY);
          else { var on = b.classList.toggle('on'); if (on) { var o = a.querySelector('button[data-a="' + (b.dataset.a === 'up' ? 'down' : 'up') + '"]'); o.classList.remove('on'); } }
        };
        d.appendChild(a);
      }
      if (sources && sources.length) {
        var cites = document.createElement('div'); cites.className = 'cites';
        var lab = document.createElement('span'); lab.className = 'cites-label'; lab.textContent = '출처'; cites.appendChild(lab);
        sources.forEach(function (s, i) {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'cite';
          b.innerHTML = '<i>' + (i + 1) + '</i><span></span>'; b.lastChild.textContent = s.title || 'Untitled';
          b.onclick = function () { openSource(sources, i); };
          cites.appendChild(b);
        });
        d.appendChild(cites);
      }      toBottom();
    };
    if (!animate) { finish(); return Promise.resolve(); }
    return new Promise(function (resolve) {
      var i = 0, n = text.length, step = Math.max(2, Math.ceil(n / 150));
      typingTimer = setInterval(function () {
        i = Math.min(n, i + step);
        c.innerHTML = md(text.slice(0, i));
        toBottom();
        if (i >= n) { clearInterval(typingTimer); typingTimer = null; finish(); resolve(); }
      }, 16);
      d._skip = function () { if (typingTimer) { clearInterval(typingTimer); typingTimer = null; finish(); resolve(); } };
      thread._cur = d;
    });
  }

  function syncEmpty() { app.classList.toggle('has-msgs', !!(current && current.messages.length)); }
  function openChat(id) {
    if (loading) stop();
    current = chats.find(function (c) { return c.id === id; });
    thread.innerHTML = '';
    if (current) current.messages.forEach(function (m) {
      if (m.role === 'user') addUser(m.content); else addAssistant(m.content, m.sources, m.error, false);
    });
    syncEmpty(); renderHistory(); toBottom();
  }
  function newChat() {
    if (loading) stop();
    current = null; thread.innerHTML = ''; syncEmpty(); renderHistory(); input.focus();
  }
  $('newChat').onclick = function () { newChat(); if (window.innerWidth <= 768) setSide(false); };

  /* ---------- send ---------- */
  function setLoading(v) {
    loading = v;
    sendBtn.innerHTML = v ? ICON_STOP : ICON_SEND;
    sendBtn.title = v ? '중지' : '전송';
    sendBtn.disabled = !v && !input.value.trim();
  }
  function stop() {
    if (ctrl) ctrl.abort();
    if (thread._cur && thread._cur._skip) thread._cur._skip();
  }
  function autosize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 200) + 'px'; }
  input.addEventListener('input', function () { autosize(); if (!loading) sendBtn.disabled = !input.value.trim(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault(); if (!loading) form.requestSubmit();
    }
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (loading) { stop(); return; }
    var text = input.value.trim(); if (!text) return;
    send(text);
  });

  function send(text) {
    if (!current) {
      current = { id: uid(), title: text.replace(/\s+/g, ' ').slice(0, 40), messages: [], updated: Date.now() };
      chats.push(current);
    }
    var chat = current;
    chat.messages.push({ role: 'user', content: text });
    chat.updated = Date.now(); save();
    input.value = ''; autosize();
    syncEmpty(); addUser(text); renderHistory();

    var wait = document.createElement('div'); wait.className = 'msg assistant';
    wait.innerHTML = '<div class="dot"></div>'; thread.appendChild(wait); toBottom();
    setLoading(true);
    ctrl = new AbortController();
    var payload = chat.messages.map(function (m) { return { role: m.role, content: m.content }; });

    fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread_id: chat.id, messages: payload }), signal: ctrl.signal })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
          return j;
        });
      })
      .then(function (j) {
        wait.remove();
        var ans = String(j.answer || ''), src = Array.isArray(j.sources) ? j.sources : [];
        chat.messages.push({ role: 'assistant', content: ans, sources: src });
        chat.updated = Date.now(); save();
        return addAssistant(ans, src, false, true);
      })
      .catch(function (err) {
        wait.remove();
        if (err.name === 'AbortError') return;
        var msg = '오류: ' + (err.message || err);
        chat.messages.push({ role: 'assistant', content: msg, error: true });
        save();
        addAssistant(msg, null, true, false);
      })
      .then(function () { ctrl = null; thread._cur = null; setLoading(false); renderHistory(); input.focus(); });
  }

  // ---------- 시작 화면 예시 질문 ----------
  (function () {
    var box = document.getElementById('suggests'); if (!box) return;
    [['동화 속 질문', '폭풍이 올 것을 거북이는 어떻게 알았을까?'],
     ['동화 속 질문', '경주 결과는 어떻게 되었나?'],
     ['동화 속 질문', '느루가 선택한 비밀 지름길은 어디에 있나요?'],
     ['일반 질문', '오늘 점심 뭐 먹지?']].forEach(function (q) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'suggest';
      b.innerHTML = '<small></small><span></span>'; b.firstChild.textContent = q[0]; b.lastChild.textContent = q[1];
      b.onclick = function () { if (!loading) send(q[1]); };
      box.appendChild(b);
    });
  })();
  /* ---------- init ---------- */
  applyTheme(); load(); setLoading(false); syncEmpty(); renderHistory(); input.focus();
})();
