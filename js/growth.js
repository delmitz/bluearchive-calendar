// 조각작 page, 숙련 증서 tab: limited, fest and distributed students. Students
// not yet sold in the 숙련 증서 shop come first under "추가예정" (newest
// first appearance first); the rest follow by newest shop addition, with a
// "n월" badge on students whose KR shop addition is still ahead (already
// added in JP, KR date estimated).
// Each row shows the viewer's own progress (target stage and elephs held
// toward it) as text and as a bar split by stage. Progress lives in this
// browser only (localStorage), with export and import as JSON files.
(function (root) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // The kind of student is shown by the row background only.
  var KINDS = { limited: 'st-limited', fes: 'st-fes', welfare: 'st-welfare' };

  // Stages in order with the elephs each one costs. "전4" means all done.
  var STAGES = [
    { key: '3성', cost: 100, cls: 'pg-star' },
    { key: '4성', cost: 120, cls: 'pg-star' },
    { key: '전1', cost: 120, cls: 'pg-weapon' },
    { key: '전2', cost: 180, cls: 'pg-weapon' },
    { key: '전3', cost: 200, cls: 'pg-weapon' }
  ];
  var DONE = '전4';
  var STAGE_KEYS = STAGES.map(function (s) { return s.key; }).concat(DONE);

  function stageIndex(key) { return STAGE_KEYS.indexOf(key); }

  // "2026-12-01" -> "12월"
  function addedText(day) {
    return +day.split('-')[1] + '월';
  }

  // A stage as stars: "n성" is n yellow stars, "전n" is n blue stars.
  var STAR_PATH = 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z';
  function starsHtml(key) {
    var weapon = key.charAt(0) === '전';
    var n = parseInt(weapon ? key.slice(1) : key, 10);
    var star = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + STAR_PATH + '"/></svg>';
    return '<span class="pg-stars ' + (weapon ? 'pg-stars-weapon' : 'pg-stars-star') + '" role="img" aria-label="' +
      esc(key) + '">' + new Array(n + 1).join(star) + '</span>';
  }

  // p: [stage, held] or undefined.
  function stateText(p) {
    if (!p) return '<span class="pg-none">–</span>';
    return starsHtml(p[0]) + (p[0] === DONE ? '' : '<span class="pg-held">' + p[1] + '</span>');
  }

  // Stages before the target are full; the target stage fills by held/cost.
  function barHtml(p) {
    var at = p ? stageIndex(p[0]) : -1;
    return '<span class="pg-bar" aria-hidden="true">' + STAGES.map(function (s, i) {
      var frac = !p ? 0 : i < at ? 1 : i === at ? Math.min(1, (p[1] || 0) / s.cost) : 0;
      return '<span class="pg-seg ' + s.cls + '" style="flex-grow:' + s.cost + '">' +
        '<span class="pg-fill" style="width:' + (frac * 100).toFixed(1) + '%"></span></span>';
    }).join('') + '</span>';
  }

  function rowHtml(s, today, progress) {
    var upcoming = s.shop && today && s.shop > today;
    var p = progress[s.name];
    return '<li class="st-row ' + KINDS[s.kind] + '" data-name="' + esc(s.name) + '">' +
      '<button type="button" class="st-main">' +
      '<span class="st-name">' + esc(s.name) +
      (upcoming ? '<time class="st-date" datetime="' + s.shop + '">' + addedText(s.shop) + '</time>' : '') +
      '</span><span class="st-extra"><span class="pg-state">' + stateText(p) + '</span>' +
      barHtml(p) + '</span></button></li>';
  }

  function listHtml(students, today, progress) {
    return '<ul class="st-list">' + students.map(function (s) {
      return rowHtml(s, today, progress);
    }).join('') + '</ul>';
  }

  function sectionHtml(label, count) {
    return '<p class="st-section">' + label + ' <span class="st-count">' + count + '</span></p>';
  }

  // data: Adapter.certStudents() output. today: "YYYY-MM-DD".
  // progress: { name: [stage, held] }. pendingOpen: show 추가예정 unfolded.
  function certHtml(data, today, progress, pendingOpen) {
    progress = progress || {};
    if (!data.pending.length && !data.added.length) return '<p class="page-empty">표시할 학생이 없습니다.</p>';
    // Fully grown students (전4) are gathered in a last list, in page order.
    function isDone(s) { return progress[s.name] && progress[s.name][0] === DONE; }
    function notDone(s) { return !isDone(s); }
    var pending = data.pending.filter(notDone), added = data.added.filter(notDone);
    var done = data.pending.concat(data.added).filter(isDone);
    return '<div class="pg-tools"><button type="button" data-act="export">내보내기</button>' +
      '<button type="button" data-act="import">가져오기</button>' +
      '<input type="file" accept="application/json,.json" hidden></div>' +
      // Upcoming students fold away (closed unless pendingOpen).
      (pending.length ? '<details class="st-fold"' + (pendingOpen ? ' open' : '') + '>' +
        '<summary class="st-section">추가예정 <span class="st-count">' + pending.length + '</span></summary>' +
        listHtml(pending, today, progress) + '</details>' : '') +
      (added.length ? sectionHtml('판매 목록', added.length) + listHtml(added, today, progress) : '') +
      (done.length ? sectionHtml('성장 완료', done.length) + listHtml(done, today, progress) : '');
  }

  // Editor shown under a row: stage choices and the elephs held.
  function editorHtml(p) {
    var cur = p ? p[0] : '';
    return '<div class="pg-editor">' +
      '<div class="pg-stages" role="group" aria-label="목표 단계">' + STAGE_KEYS.map(function (k) {
        return '<button type="button" data-stage="' + k + '" aria-pressed="' + (k === cur) + '">' + starsHtml(k) + '</button>';
      }).join('') + '</div>' +
      '<label class="pg-held-input">보유 <input type="number" min="0" max="999" inputmode="numeric" value="' +
      (p && p[0] !== DONE ? p[1] : 0) + '"' + (cur === DONE ? ' disabled' : '') + '></label>' +
      '<button type="button" data-act="save">저장</button>' +
      '<button type="button" data-act="clear">지우기</button></div>';
  }

  // Browser side: progress storage, row editing, export and import.
  var STORE_KEY = 'certProgress.v1';

  // Progress is keyed by student name as written in the sheet. When a name
  // changes there, add "old name": "new name" here so saved progress (and
  // imported files) follow the student instead of being left behind.
  var RENAMES = {
    '시로코＊테러': '시로코*테러'
  };

  // Moves entries under renamed names to the current name (follows chains).
  // An entry already saved under the new name wins. Returns true if changed.
  function migrateNames(progress) {
    var changed = false;
    Object.keys(progress).forEach(function (name) {
      var to = name, seen = {};
      while (RENAMES[to] && !seen[to]) { seen[to] = true; to = RENAMES[to]; }
      if (to === name) return;
      if (!progress[to]) progress[to] = progress[name];
      delete progress[name];
      changed = true;
    });
    return changed;
  }

  function loadProgress() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(STORE_KEY);
      if (raw) {
        var saved = JSON.parse(raw) || {};
        if (migrateNames(saved)) saveProgress(saved);
        return saved;
      }
    } catch (e) { /* storage unavailable: fall back to the seed */ }
    var seed = root.CertSeed || {};
    var copy = {};
    Object.keys(seed).forEach(function (n) { copy[n] = seed[n].slice(); });
    migrateNames(copy);
    return copy;
  }

  function saveProgress(progress) {
    try { root.localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (e) { /* ignore */ }
  }

  // Keep only well-formed entries from imported JSON.
  function cleanProgress(obj) {
    var out = {};
    Object.keys(obj || {}).forEach(function (n) {
      var v = obj[n];
      if (Array.isArray(v) && stageIndex(v[0]) >= 0) out[n] = [v[0], Math.max(0, Math.floor(+v[1] || 0))];
    });
    migrateNames(out);
    return out;
  }

  function mount(el, data, today) {
    var progress = loadProgress();
    // Name column width: wide enough for the longest name plus about 1.5
    // characters, and for any name with its month badge on one line. Measured
    // from the rendered text (only possible while the page is visible).
    function fitNames() {
      if (!el.offsetWidth) return;
      var first = el.querySelector('.st-name');
      var size = parseFloat(getComputedStyle(first).fontSize) || 14;
      var widest = 0;
      Array.prototype.forEach.call(el.querySelectorAll('.st-name'), function (n) {
        if (!n.offsetWidth) return; // inside the folded list
        var range = document.createRange();
        range.selectNodeContents(n.firstChild);
        var text = range.getBoundingClientRect().width;
        var need = text + size * 1.5;
        var badge = n.querySelector('.st-date');
        if (badge) {
          need = Math.max(need, text + badge.getBoundingClientRect().width +
            (parseFloat(getComputedStyle(badge).marginLeft) || 0) + 2);
        }
        widest = Math.max(widest, need);
      });
      if (widest) el.style.setProperty('--st-name-w', Math.ceil(widest) + 'px');
    }
    function render() {
      var fold = el.querySelector('.st-fold');
      el.innerHTML = certHtml(data, today, progress, !!(fold && fold.open));
      fitNames();
    }
    render();
    root.addEventListener('route', function () { setTimeout(fitNames, 0); });
    el.addEventListener('toggle', fitNames, true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitNames);

    function closeEditor() {
      Array.prototype.forEach.call(el.querySelectorAll('.pg-editor'), function (e) {
        e.parentNode.classList.remove('is-editing');
        e.parentNode.removeChild(e);
      });
    }

    function exportProgress() {
      var blob = new Blob([JSON.stringify(progress, null, 1)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'cert-progress.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }

    function onEditorClick(editor, t) {
      var row = editor.parentNode;
      var name = row.getAttribute('data-name');
      var input = editor.querySelector('input');
      var stageBtn = t.closest('[data-stage]');
      if (stageBtn) {
        Array.prototype.forEach.call(editor.querySelectorAll('[data-stage]'), function (b) {
          b.setAttribute('aria-pressed', String(b === stageBtn));
        });
        input.disabled = stageBtn.getAttribute('data-stage') === DONE;
        return;
      }
      var act = t.closest('[data-act]');
      if (!act) return;
      if (act.getAttribute('data-act') === 'save') {
        var chosen = editor.querySelector('[data-stage][aria-pressed="true"]');
        if (!chosen) return;
        var stage = chosen.getAttribute('data-stage');
        progress[name] = [stage, stage === DONE ? 0 : Math.max(0, Math.floor(+input.value || 0))];
      } else if (act.getAttribute('data-act') === 'clear') {
        delete progress[name];
      } else {
        return;
      }
      saveProgress(progress);
      render();
    }

    el.onclick = function (ev) {
      var t = ev.target;
      var editor = t.closest('.pg-editor');
      if (editor) { onEditorClick(editor, t); return; }
      var act = t.closest('.pg-tools [data-act]');
      if (act) {
        if (act.getAttribute('data-act') === 'export') exportProgress();
        else el.querySelector('.pg-tools input[type=file]').click();
        return;
      }
      var main = t.closest('.st-main');
      if (!main) return;
      var row = main.parentNode;
      var wasOpen = row.classList.contains('is-editing');
      closeEditor();
      if (wasOpen) return;
      row.classList.add('is-editing');
      row.insertAdjacentHTML('beforeend', editorHtml(progress[row.getAttribute('data-name')]));
    };

    el.onchange = function (ev) {
      var input = ev.target;
      if (!input.matches('.pg-tools input[type=file]') || !input.files[0]) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          progress = cleanProgress(JSON.parse(reader.result));
          saveProgress(progress);
          render();
        } catch (e) {
          alert('가져올 수 없는 파일입니다.');
        }
      };
      reader.readAsText(input.files[0]);
    };
  }

  var api = { certHtml: certHtml, mount: mount, migrateNames: migrateNames };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GrowthPage = api;
})(this);
