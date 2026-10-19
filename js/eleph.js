// 조각작 page, 숙련 증서 tab: limited, fest and distributed students. Students
// not yet sold in the 숙련 증서 shop come first under "추가예정" (newest
// first appearance first); the rest follow by newest shop addition, with a
// "n월" badge on students whose KR shop addition is still ahead (already
// added in JP, KR date estimated).
// Each row shows the viewer's own progress (target stage and elephs held
// toward it) as text and as a bar split by stage. Progress lives in this
// browser only (localStorage). A row opens its own editor when tapped, and
// 일괄 편집 switches every row to stage/count controls saved together; 이미지
// 저장 downloads the whole list as a PNG; export shows
// the progress as one line of JSON to copy and import takes that JSON pasted
// into a text box.
(function (root) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // The kind of student is shown by the row background only.
  var KINDS = { limited: 'st-limited', fes: 'st-fes', welfare: 'st-welfare' };

  // Stages in order with the elephs each one costs (a stage is where the
  // student is now; its cost is the step to the next). "전4" means all done.
  var ALL_STAGES = [
    { key: '1성', cost: 30, cls: 'pg-star' },
    { key: '2성', cost: 80, cls: 'pg-star' },
    { key: '3성', cost: 100, cls: 'pg-star' },
    { key: '4성', cost: 120, cls: 'pg-star' },
    { key: '전1', cost: 120, cls: 'pg-weapon' },
    { key: '전2', cost: 180, cls: 'pg-weapon' },
    { key: '전3', cost: 200, cls: 'pg-weapon' }
  ];
  var DONE = '전4';
  // Stages a student can be at, from their initial star rating (1-3).
  function stagesFrom(star) { return ALL_STAGES.slice(star - 1); }
  // The expert permit list starts at 3성 (limited, fest and distributed
  // students are tracked from there).
  var STAGES = stagesFrom(3);
  function keysOf(stages) { return stages.map(function (s) { return s.key; }).concat(DONE); }
  var STAGE_KEYS = keysOf(ALL_STAGES);

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

  // Stages before the current one are full; the current stage fills by
  // held/cost. The 숙련 증서 list shows stages from 3성 (STAGES), the 하드
  // list all stages from 1성.
  function barHtml(p, stages) {
    stages = stages || STAGES;
    var at = p ? keysOf(stages).indexOf(p[0]) : -1;
    return '<span class="pg-bar" aria-hidden="true">' + stages.map(function (s, i) {
      var frac = !p ? 0 : i < at ? 1 : i === at ? Math.min(1, (p[1] || 0) / s.cost) : 0;
      return '<span class="pg-seg ' + s.cls + '" style="flex-grow:' + s.cost + '">' +
        '<span class="pg-fill" style="width:' + (frac * 100).toFixed(1) + '%"></span></span>';
    }).join('') + '</span>';
  }

  // Edit mode controls in place of the stars and count: a stage menu
  // ("–" clears) and the elephs held (off for 전4 and "–").
  // stages: the stages offered (defaults to the 숙련 증서 ones, from 3성).
  function editHtml(name, p, stages) {
    var cur = p ? p[0] : '';
    var off = !p || p[0] === DONE;
    return '<span class="pg-edit"><select class="pg-stage-select" aria-label="' + esc(name) + ' 목표 단계">' +
      '<option value=""' + (cur ? '' : ' selected') + '>–</option>' + keysOf(stages || STAGES).map(function (k) {
        return '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + k + '</option>';
      }).join('') + '</select><input class="pg-held-edit" type="number" min="0" max="999" inputmode="numeric" ' +
      'aria-label="' + esc(name) + ' 보유 엘레프" value="' + (off ? '' : p[1]) + '"' + (off ? ' disabled' : '') + '></span>';
  }

  function rowHtml(s, today, progress, editing) {
    var upcoming = s.shop && today && s.shop > today;
    var p = progress[s.name];
    // In edit mode the row is not a button (it holds form controls).
    var tag = editing ? 'div' : 'button';
    return '<li class="st-row ' + KINDS[s.kind] + '" data-name="' + esc(s.name) + '">' +
      '<' + tag + (editing ? '' : ' type="button"') + ' class="st-main">' +
      '<span class="st-name">' + esc(s.name) +
      (upcoming ? '<time class="st-date" datetime="' + s.shop + '">' + addedText(s.shop) + '</time>' : '') +
      '</span><span class="st-extra">' +
      (editing ? editHtml(s.name, p) : '<span class="pg-state">' + stateText(p) + '</span>') +
      barHtml(p) + '</span></' + tag + '></li>';
  }

  function listHtml(students, today, progress, editing, cls) {
    return '<ul class="st-list' + (cls ? ' ' + cls : '') + '">' + students.map(function (s) {
      return rowHtml(s, today, progress, editing);
    }).join('') + '</ul>';
  }

  function sectionHtml(label, count) {
    return '<p class="st-section">' + label + ' <span class="st-count">' + count + '</span></p>';
  }

  function saleCount(added, hideWelfare) {
    return added.filter(function (s) { return !hideWelfare || s.kind !== 'welfare'; }).length;
  }

  function saleSectionHtml(added, hideWelfare) {
    return '<p class="st-section">판매 목록 <span class="st-count">' + saleCount(added, hideWelfare) + '</span>' +
      '<label class="st-filter"><input type="checkbox" data-act="hide-welfare"' + (hideWelfare ? ' checked' : '') +
      '> 배포캐릭터 제외</label></p>';
  }

  // data: Adapter.expertStudents() output. today: "YYYY-MM-DD".
  // progress: { name: [stage, held] }. pendingOpen: show 추가예정 unfolded.
  // hideWelfare: leave distributed students out of the 판매 목록 list.
  // editing: every row shows stage and count controls, saved all at once.
  function expertHtml(data, today, progress, pendingOpen, editing, hideWelfare) {
    progress = progress || {};
    if (!data.pending.length && !data.added.length) return '<p class="page-empty">표시할 학생이 없습니다.</p>';
    // Fully grown students (전4) are gathered in a last list, in page order.
    function isDone(s) { return progress[s.name] && progress[s.name][0] === DONE; }
    function notDone(s) { return !isDone(s); }
    var pending = data.pending.filter(notDone), added = data.added.filter(notDone);
    var done = data.pending.concat(data.added).filter(isDone);
    function list(students) { return listHtml(students, today, progress, editing); }
    return (editing ?
      '<div class="pg-tools is-editing"><span class="pg-tools-note">일괄 편집 중</span>' +
        '<button type="button" class="pg-primary" data-act="edit-save">저장</button>' +
        '<button type="button" data-act="edit-cancel">취소</button></div>' :
      '<div class="pg-tools"><button type="button" data-act="image">이미지 저장</button>' +
        '<button type="button" data-act="edit">일괄 편집</button>' +
        '<button type="button" data-act="export">내보내기</button>' +
        '<button type="button" data-act="import">가져오기</button></div>') +
      '<div class="pg-export pg-panel" hidden><textarea rows="4" readonly spellcheck="false" ' +
      'aria-label="내보낼 JSON"></textarea><p class="pg-export-msg pg-note" role="status"></p>' +
      '<div class="pg-panel-acts"><button type="button" data-act="export-copy">복사</button>' +
      '<button type="button" data-act="export-close">닫기</button></div></div>' +
      '<div class="pg-import pg-panel" hidden><textarea rows="5" spellcheck="false" ' +
      'placeholder="내보낸 JSON 텍스트를 붙여넣으세요" aria-label="가져올 JSON"></textarea>' +
      '<p class="pg-import-msg pg-error" role="status"></p><div class="pg-panel-acts">' +
      '<button type="button" data-act="import-apply">불러오기</button>' +
      '<button type="button" data-act="import-cancel">취소</button></div></div>' +
      // Upcoming students fold away (closed unless pendingOpen).
      (pending.length ? '<details class="st-fold"' + (pendingOpen ? ' open' : '') + '>' +
        '<summary class="st-section">추가예정 <span class="st-count">' + pending.length + '</span></summary>' +
        list(pending) + '</details>' : '') +
      // The 판매 목록 rows are all rendered; the checkbox only hides the
      // distributed ones (so bulk-edit drafts survive toggling it).
      (added.length ? saleSectionHtml(added, hideWelfare) +
        listHtml(added, today, progress, editing, 'st-sale' + (hideWelfare ? ' is-hide-welfare' : '')) : '') +
      (done.length ? sectionHtml('성장 완료', done.length) + list(done) : '') +
      // A second save/cancel pair at the end of the lists.
      (editing ? '<div class="pg-tools pg-tools-end">' +
        '<button type="button" class="pg-primary" data-act="edit-save">저장</button>' +
        '<button type="button" data-act="edit-cancel">취소</button></div>' : '');
  }

  // Editor shown under a row: stage choices (「없음」 clears the entry on
  // save) and the elephs held.
  // buy: add a 「+10」 button beside the count (held + 10, then save).
  function editorHtml(p, stages, buy) {
    var cur = p ? p[0] : '';
    var off = !cur || cur === DONE ? ' disabled' : '';
    return '<div class="pg-editor">' +
      '<div class="pg-stages" role="group" aria-label="목표 단계">' +
      '<button type="button" data-stage="" aria-pressed="' + !cur + '">없음</button>' +
      keysOf(stages || STAGES).map(function (k) {
        return '<button type="button" data-stage="' + k + '" aria-pressed="' + (k === cur) + '">' + starsHtml(k) + '</button>';
      }).join('') + '</div>' +
      '<span class="pg-held-group"><label class="pg-held-input">보유 <input type="number" min="0" max="999" inputmode="numeric" value="' +
      (p && p[0] !== DONE ? p[1] : 0) + '"' + off + '></label>' +
      (buy ? '<button type="button" class="pg-buy" data-act="buy" aria-label="10개 구매"' + off + '>+10</button>' : '') +
      '</span><button type="button" data-act="save">저장</button></div>';
  }

  // Browser side: progress storage, row editing, export and import.
  var STORE_KEY = 'expertProgress.v1';
  var HARD_STORE_KEY = 'hardProgress.v1'; // the 하드 tab's own progress

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

  // key: the storage key, defaulting to the 숙련 증서 store. The 하드 tab
  // keeps its own store.
  function loadProgress(key) {
    key = key || STORE_KEY;
    try {
      var raw = root.localStorage && root.localStorage.getItem(key);
      if (raw) {
        var saved = JSON.parse(raw) || {};
        if (migrateNames(saved)) saveProgress(saved, key);
        return saved;
      }
    } catch (e) { /* storage unavailable: start empty */ }
    return {};
  }

  function saveProgress(progress, key) {
    try { root.localStorage.setItem(key || STORE_KEY, JSON.stringify(progress)); } catch (e) { /* ignore */ }
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

  // The 숙련 증서 tab's progress store. Changes are announced with an
  // "elephprogress" event.
  var shared = null;
  function getProgress() {
    if (!shared) shared = loadProgress();
    return shared;
  }
  function commit(next, from) {
    shared = next;
    saveProgress(next);
    root.dispatchEvent(new CustomEvent('elephprogress', { detail: from }));
  }

  // Name column width (phones): wide enough for the longest name plus about
  // 1.5 characters, and for any name with its month badge on one line.
  // Measured from the rendered text (only possible while it is visible).
  function fitNameColumn(el) {
    if (!el.offsetWidth) return;
    var first = el.querySelector('.st-name');
    if (!first) return;
    var size = parseFloat(getComputedStyle(first).fontSize) || 14;
    var widest = 0;
    Array.prototype.forEach.call(el.querySelectorAll('.st-name'), function (n) {
      if (!n.offsetWidth) return; // inside a folded list
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

  function closeEditors(el) {
    Array.prototype.forEach.call(el.querySelectorAll('.pg-editor'), function (e) {
      e.parentNode.classList.remove('is-editing');
      e.parentNode.removeChild(e);
    });
  }

  // Opens (or closes, if already open) the editor under a row.
  function toggleRowEditor(el, row, progress, stages, buy) {
    var wasOpen = row.classList.contains('is-editing');
    closeEditors(el);
    if (wasOpen) return;
    row.classList.add('is-editing');
    row.insertAdjacentHTML('beforeend', editorHtml(progress[row.getAttribute('data-name')], stages, buy));
  }

  // A click inside a row editor: picks a stage, or saves/clears the row's
  // entry in progress. Returns true when progress changed.
  function editorClick(editor, t, progress) {
    var name = editor.parentNode.getAttribute('data-name');
    var input = editor.querySelector('input');
    var stageBtn = t.closest('[data-stage]');
    if (stageBtn) {
      Array.prototype.forEach.call(editor.querySelectorAll('[data-stage]'), function (b) {
        b.setAttribute('aria-pressed', String(b === stageBtn));
      });
      var picked = stageBtn.getAttribute('data-stage');
      input.disabled = !picked || picked === DONE;
      var buy = editor.querySelector('[data-act="buy"]');
      if (buy) buy.disabled = input.disabled;
      return false;
    }
    var act = t.closest('[data-act]');
    if (!act) return false;
    var what = act.getAttribute('data-act');
    if (what === 'save' || what === 'buy') {
      var chosen = editor.querySelector('[data-stage][aria-pressed="true"]');
      if (!chosen) return false;
      var stage = chosen.getAttribute('data-stage');
      if (what === 'buy' && (!stage || stage === DONE)) return false;
      if (!stage) {
        if (!progress[name]) return false;
        delete progress[name];
        return true;
      }
      var held = Math.max(0, Math.floor(+input.value || 0)) + (what === 'buy' ? 10 : 0);
      progress[name] = [stage, stage === DONE ? 0 : Math.min(999, held)];
      return true;
    }
    return false;
  }

  function mount(el, data, today) {
    var progress = getProgress();
    var editing = false;
    var hideWelfare = false;
    function fitNames() { fitNameColumn(el); }
    function render() {
      var fold = el.querySelector('.st-fold');
      el.innerHTML = expertHtml(data, today, progress, !!(fold && fold.open), editing, hideWelfare);
      var tabs = document.querySelector('.site-tabs');
      if (tabs && tabs.offsetHeight) el.style.setProperty('--site-tabs-h', tabs.offsetHeight + 'px');
      fitNames();
    }
    render();
    root.addEventListener('route', function () { setTimeout(fitNames, 0); });
    el.addEventListener('toggle', fitNames, true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitNames);
    root.addEventListener('elephprogress', function (ev) {
      if (ev.detail === el) return;
      progress = shared;
      if (!editing) render();
    });

    function closeEditor() { closeEditors(el); }

    // Export: show the saved progress as one line of JSON to copy.
    function toggleExport() {
      var box = el.querySelector('.pg-export');
      el.querySelector('.pg-import').hidden = true;
      box.hidden = !box.hidden;
      box.querySelector('.pg-export-msg').textContent = '';
      if (!box.hidden) box.querySelector('textarea').value = JSON.stringify(progress);
    }

    function copyExport() {
      var box = el.querySelector('.pg-export');
      var area = box.querySelector('textarea');
      var msg = box.querySelector('.pg-export-msg');
      function done() { msg.textContent = '복사했습니다.'; }
      function fallback() {
        area.focus();
        area.select();
        try { if (document.execCommand('copy')) { done(); return; } } catch (e) { /* ignore */ }
        msg.textContent = '자동 복사가 안 되니 선택된 내용을 직접 복사해 주세요.';
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(area.value).then(done, fallback);
      } else {
        fallback();
      }
    }

    function onEditorClick(editor, t) {
      if (!editorClick(editor, t, progress)) return;
      commit(progress, el);
      render();
    }

    // Edit mode: read every row's controls and save them together. Students
    // not on the page keep their saved values.
    function saveEdits() {
      var next = {};
      Object.keys(progress).forEach(function (n) { next[n] = progress[n]; });
      Array.prototype.forEach.call(el.querySelectorAll('.st-row'), function (row) {
        var name = row.getAttribute('data-name');
        var stage = row.querySelector('.pg-stage-select').value;
        var held = row.querySelector('.pg-held-edit').value;
        if (!stage) { delete next[name]; return; }
        next[name] = [stage, stage === DONE ? 0 : Math.min(999, Math.max(0, Math.floor(+held || 0)))];
      });
      progress = next;
      commit(progress, el);
    }

    // Keeps a row's count box and bar in step with its controls while editing.
    function onEditInput(row) {
      var stage = row.querySelector('.pg-stage-select').value;
      var input = row.querySelector('.pg-held-edit');
      input.disabled = !stage || stage === DONE;
      if (input.disabled) input.value = '';
      var p = stage ? [stage, stage === DONE ? 0 : Math.max(0, Math.floor(+input.value || 0))] : undefined;
      row.querySelector('.pg-bar').outerHTML = barHtml(p);
    }

    // Image export: the whole list (추가예정 unfolded) as a PNG, drawn by the
    // html-to-image library, loaded on first use.
    var IMAGE_LIB = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js';
    var MAX_PIXELS = 16e6; // stays under mobile Safari's canvas size limit
    var libLoading = null;

    function loadImageLib() {
      if (root.htmlToImage) return Promise.resolve(root.htmlToImage);
      if (!libLoading) {
        libLoading = new Promise(function (resolve, reject) {
          var sc = document.createElement('script');
          sc.src = IMAGE_LIB;
          sc.onload = function () { resolve(root.htmlToImage); };
          sc.onerror = function () { libLoading = null; reject(new Error('image library failed to load')); };
          document.head.appendChild(sc);
        });
      }
      return libLoading;
    }

    function saveImage(btn) {
      var label = btn.textContent;
      btn.disabled = true;
      btn.textContent = '만드는 중…';
      hidePanels();
      closeEditor();
      var fold = el.querySelector('.st-fold');
      var wasOpen = fold && fold.open;
      if (fold) fold.open = true;
      fitNames();
      function restore() {
        if (fold) fold.open = wasOpen;
        fitNames();
        btn.disabled = false;
        btn.textContent = label;
      }
      loadImageLib().then(function (lib) {
        var w = el.scrollWidth, h = el.scrollHeight;
        var ratio = Math.min(2, Math.sqrt(MAX_PIXELS / (w * h)));
        return lib.toBlob(el, {
          pixelRatio: ratio,
          backgroundColor: getComputedStyle(el.closest('.app') || document.body).backgroundColor,
          // Toolbar, panels and the list filter are controls, not content.
          filter: function (node) {
            return !(node.classList && (node.classList.contains('pg-tools') || node.classList.contains('pg-panel') ||
              node.classList.contains('st-filter')));
          }
        });
      }).then(function (blob) {
        restore();
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'expert-' + today.replace(/-/g, '') + '.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      }).catch(function (e) {
        restore();
        console.error(e);
        btn.textContent = '이미지 실패';
        setTimeout(function () { btn.textContent = label; }, 2500);
      });
    }

    // Puts the import box back to its first step (no pending overwrite).
    function resetImport() {
      var box = el.querySelector('.pg-import');
      var apply = box.querySelector('[data-act="import-apply"]');
      apply.classList.remove('is-armed');
      apply.textContent = '불러오기';
      var msg = box.querySelector('.pg-import-msg');
      msg.className = 'pg-import-msg pg-error';
      msg.textContent = '';
    }

    function hidePanels() {
      Array.prototype.forEach.call(el.querySelectorAll('.pg-panel'), function (b) { b.hidden = true; });
    }

    // Import: paste exported JSON into the text box; it replaces all saved
    // progress once it parses.
    function onToolClick(name, btn) {
      if (name === 'image') { saveImage(btn); return; }
      if (name === 'edit') { hidePanels(); closeEditor(); editing = true; render(); return; }
      if (name === 'edit-cancel') { editing = false; render(); return; }
      if (name === 'edit-save') { saveEdits(); editing = false; render(); return; }
      var box = el.querySelector('.pg-import');
      var area = box.querySelector('textarea');
      var msg = box.querySelector('.pg-import-msg');
      if (name === 'export') { toggleExport(); return; }
      if (name === 'export-copy') { copyExport(); return; }
      if (name === 'export-close') { el.querySelector('.pg-export').hidden = true; return; }
      if (name === 'import') {
        el.querySelector('.pg-export').hidden = true;
        box.hidden = !box.hidden;
        resetImport();
        if (!box.hidden) area.focus();
        return;
      }
      if (name === 'import-cancel') { box.hidden = true; area.value = ''; resetImport(); return; }
      if (name !== 'import-apply') return;
      var parsed;
      try { parsed = JSON.parse(area.value); } catch (e) { parsed = null; }
      var next = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? cleanProgress(parsed) : null;
      if (!next || !Object.keys(next).length) {
        resetImport();
        msg.textContent = '불러올 수 없는 내용입니다. 내보내기로 받은 JSON을 그대로 붙여넣어 주세요.';
        return;
      }
      // Replacing saved progress takes a second press (an in-page step, since
      // some browsers and embedded views suppress confirm() and return false).
      var apply = box.querySelector('[data-act="import-apply"]');
      if (Object.keys(progress).length && !apply.classList.contains('is-armed')) {
        apply.classList.add('is-armed');
        apply.textContent = '덮어쓰기';
        msg.className = 'pg-import-msg pg-note';
        msg.textContent = '저장된 진행 상황 ' + Object.keys(progress).length + '명을 붙여넣은 ' +
          Object.keys(next).length + '명으로 바꿉니다. 「덮어쓰기」를 한 번 더 누르면 적용됩니다.';
        return;
      }
      progress = next;
      commit(progress, el);
      render();
    }

    el.onclick = function (ev) {
      var t = ev.target;
      var editor = t.closest('.pg-editor');
      if (editor) { onEditorClick(editor, t); return; }
      var act = t.closest('.pg-tools [data-act], .pg-panel [data-act]');
      if (act) { onToolClick(act.getAttribute('data-act'), act); return; }
      var main = t.closest('.st-main');
      if (!main || editing) return;
      toggleRowEditor(el, main.parentNode, progress, null, true);
    };

    el.oninput = function (ev) {
      if (ev.target.matches('[data-act="hide-welfare"]')) {
        hideWelfare = ev.target.checked;
        el.querySelector('.st-sale').classList.toggle('is-hide-welfare', hideWelfare);
        ev.target.closest('.st-section').querySelector('.st-count').textContent = saleCount(data.added.filter(function (s) {
          return !(progress[s.name] && progress[s.name][0] === DONE);
        }), hideWelfare);
        fitNames();
        return;
      }
      if (ev.target.closest('.pg-import')) { resetImport(); return; }
      var row = editing && ev.target.closest('.st-row');
      if (row && ev.target.closest('.pg-edit')) onEditInput(row);
    };
    el.onchange = el.oninput;

  }

  // 하드 tab: the student whose elephs drop in each Hard stage, by area (1-30)
  // and stage (1-3), from the old manual sheet's 하드파밍 tab.
  var HARD_STAGES = [
    ['유우카', '스즈미', '세리카'],
    ['코토리', '아카리', '준코'],
    ['스즈미', '하스미', '시로코'],
    ['아스나', '피나', '유우카'],
    ['아카리', '준코', '히후미'],
    ['스즈미', '피나', '준코'],
    ['아스나', '세리카', '호시노'],
    ['코토리', '하스미', '하루나'],
    ['아카리', '세리카', '시로코'],
    ['스즈미', '피나', '히후미'],
    ['아카리', '하스미', '호시노'],
    ['코토리', '유우카', '하루나'],
    ['하루카', '무츠키', '이즈미'],
    ['카요코', '치세', '이오리'],
    ['하루카', '츠바키', '네루'],
    ['아스나', '무츠키', '히나'],
    ['요시미', '치세', '카린'],
    ['시미코', '아야네', '아루'],
    ['주리', '아이리', '이즈나'],
    ['세리나', '하레', '이오리'],
    ['요시미', '카요코', '히후미(수영복)'],
    ['시미코', '키리노', '히비키'],
    ['주리', '츠바키', '아리스'],
    ['세리나', '마리', '히나'],
    ['하루카', '아야네', '사야(사복)'],
    ['요시미', '아이리', '슌(어린이)'],
    ['시미코', '하레', '치나츠(온천)'],
    ['주리', '마리', '미사키'],
    ['세리나', '키리노', '히나타'],
    ['피나', '모미지', '체리노']
  ];

  // 프리셋 table between the progress list and the area table: seven presets
  // of three students each, kept in their own store. presets: rows of three
  // names ('' for an empty slot). While editing, each cell is a menu of the
  // 하드 students.
  var HARD_PRESET_COUNT = 7;
  var HARD_PRESET_KEY = 'hardPresets.v1';

  // Always HARD_PRESET_COUNT rows of three; anything that is not a 하드
  // student becomes an empty slot.
  function cleanPresets(list) {
    var known = {};
    hardStudents().forEach(function (st) { known[st.name] = true; });
    var out = [];
    for (var i = 0; i < HARD_PRESET_COUNT; i++) {
      var row = Array.isArray(list) && Array.isArray(list[i]) ? list[i] : [];
      out.push([0, 1, 2].map(function (k) {
        var name = typeof row[k] === 'string' ? row[k].trim() : '';
        return known[name] ? name : '';
      }));
    }
    return out;
  }

  function presetCount(presets) {
    return presets.filter(function (row) { return row.some(Boolean); }).length;
  }

  function loadPresets() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(HARD_PRESET_KEY);
      if (raw) return cleanPresets(JSON.parse(raw));
    } catch (e) { /* storage unavailable: start empty */ }
    return cleanPresets([]);
  }

  function savePresets(presets) {
    try { root.localStorage.setItem(HARD_PRESET_KEY, JSON.stringify(presets)); } catch (e) { /* ignore */ }
  }

  // AP a preset spends: 60 for every area-table cell holding one of its
  // students (each student counted once even if picked twice).
  var HARD_AP_PER_STAGE = 60;
  function presetAp(names) {
    var picked = {};
    names.forEach(function (n) { if (n) picked[n] = true; });
    var cells = 0;
    HARD_STAGES.forEach(function (area) {
      area.forEach(function (n) { if (picked[n]) cells++; });
    });
    return cells * HARD_AP_PER_STAGE;
  }

  function presetApHtml(names) {
    return '<span class="hd-preset-ap">' + presetAp(names) + ' AP</span>';
  }

  // Total over every preset; a student picked in several presets is counted
  // once, since their stages are run once.
  function presetTotalHtml(presets) {
    var names = [];
    presets.forEach(function (row) { names = names.concat(row); });
    return '<span class="hd-preset-total">전체 ' + presetAp(names) + ' AP</span>';
  }

  // The progress cell next to a preset student: stars and count (or, while
  // editing, the stage menu and count box from the student's initial rating),
  // then the bar.
  function presetProgressHtml(name, progress, editing) {
    if (!name) return '';
    var p = progress[name];
    return '<span class="hd-preset-pg">' +
      (editing ? editHtml(name, p, stagesFrom(HARD_RARITY[name] || 3)) :
        '<span class="pg-state">' + stateText(p) + '</span>') +
      barHtml(p, ALL_STAGES) + '</span>';
  }

  // One preset is three rows (one student each) under a shared 프리셋 cell,
  // with the student's progress on the right. While editing, both the student
  // and their progress are editable (progress then holds the draft).
  function hardPresetHtml(presets, editing, progress) {
    presets = cleanPresets(presets);
    progress = progress || {};
    var students = hardStudents();
    // Students grouped under unselectable ★3 / ★2 / ★1 headings (optgroup).
    function menu(name, label) {
      var groups = [3, 2, 1].map(function (star) {
        var members = students.filter(function (st) { return st.star === star; });
        if (!members.length) return '';
        return '<optgroup label="★' + star + '">' + members.map(function (st) {
          return '<option value="' + esc(st.name) + '"' + (st.name === name ? ' selected' : '') + '>' +
            esc(st.name) + '</option>';
        }).join('') + '</optgroup>';
      });
      return '<select class="hd-preset-select" aria-label="' + label + '"><option value="">–</option>' +
        groups.join('') + '</select>';
    }
    var total = editing || presetCount(presets) ? presetTotalHtml(presets) : '';
    return '<div class="pg-tools hd-preset-tools">' + (editing ?
        '<span class="pg-tools-note">프리셋 편집 중</span>' + total +
        '<button type="button" class="pg-primary" data-act="preset-save">저장</button>' +
        '<button type="button" data-act="preset-cancel">취소</button>' :
        total + '<button type="button" data-act="preset-edit">편집</button>') + '</div>' +
      // Outside editing, empty slots are left out (and presets with no
      // student at all); the edit view shows every slot.
      (!editing && !presetCount(presets) ?
        '<p class="hd-preset-none">프리셋이 없습니다. 「편집」에서 학생을 지정하세요.</p>' :
      '<table class="hd-table hd-presets"><thead><tr><th scope="col">프리셋</th>' +
      '<th scope="col">학생</th><th scope="col">육성상태</th></tr></thead>' +
      presets.map(function (row, i) {
        var slots = [];
        row.forEach(function (name, k) { if (editing || name) slots.push({ name: name, k: k }); });
        if (!slots.length) return '';
        return '<tbody>' + slots.map(function (slot, j) {
          var name = slot.name;
          var cell = editing ?
            '<td class="hd-preset-cell">' + menu(name, '프리셋 ' + (i + 1) + ' ' + (slot.k + 1) + '번') + '</td>' :
            '<td class="hd-preset-name" data-name="' + esc(name) + '">' + esc(name) + '</td>';
          return '<tr>' + (j === 0 ? '<th scope="rowgroup" rowspan="' + slots.length + '">' +
              '<span class="hd-preset-no">' + (i + 1) + '</span>' + presetApHtml(row) + '</th>' : '') + cell +
            '<td class="hd-preset-state">' + presetProgressHtml(name, progress, editing) + '</td></tr>';
        }).join('') + '</tbody>';
      }).join('') + '</table>');
  }

  // progress: the 하드 store. Cells are tinted by the student's initial star
  // rating (★1 blue, ★2 yellow, ★3 purple). Fully grown students (전4) are
  // greyed out with a fainter tint, and an
  // area whose three students are all fully grown is left out unless showAll;
  // a checkbox above the table switches that.
  function hardHtml(progress, showAll) {
    progress = progress || {};
    function done(name) { return progress[name] && progress[name][0] === DONE; }
    return '<label class="hd-show-all"><input type="checkbox" data-act="show-all"' + (showAll ? ' checked' : '') +
      '> 모두 보기</label>' +
      '<table class="hd-table"><thead><tr><th scope="col">지역</th>' +
      '<th scope="col">1</th><th scope="col">2</th><th scope="col">3</th></tr></thead><tbody>' +
      HARD_STAGES.map(function (area, i) {
        if (!showAll && area.every(done)) return '';
        return '<tr><th scope="row">' + (i + 1) + '</th>' + area.map(function (name) {
          return '<td data-name="' + esc(name) + '" class="hd-rare hd-r' + (HARD_RARITY[name] || 3) +
            (done(name) ? ' is-done' : '') + '">' + esc(name) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
  }

  // Initial star rating of each 하드 student (from the wikiru character list,
  // 2026-10-15); their stage choices start at that rating.
  var HARD_RARITY = {
    '스즈미': 1, '코토리': 1, '아스나': 1, '피나': 1, '하루카': 1, '요시미': 1, '시미코': 1, '주리': 1,
    '세리나': 1,
    '유우카': 2, '세리카': 2, '아카리': 2, '준코': 2, '하스미': 2, '무츠키': 2, '카요코': 2, '치세': 2,
    '츠바키': 2, '아야네': 2, '아이리': 2, '하레': 2, '키리노': 2, '마리': 2, '모미지': 2
  }; // everyone else in the table starts at 3

  // Students of the 하드 table: highest initial rating first, then by name.
  function hardStudents() {
    var seen = {}, out = [];
    HARD_STAGES.forEach(function (area) {
      area.forEach(function (name) {
        if (seen[name]) return;
        seen[name] = true;
        out.push({ name: name, star: HARD_RARITY[name] || 3 });
      });
    });
    return out.sort(function (a, b) { return b.star - a.star || a.name.localeCompare(b.name, 'ko'); });
  }

  // Export / import for the whole 하드 tab (progress and presets), above the
  // progress list.
  function hardToolsHtml() {
    return '<div class="pg-tools hd-tools"><button type="button" data-act="export">내보내기</button>' +
      '<button type="button" data-act="import">가져오기</button></div>' +
      '<div class="pg-export pg-panel" hidden><textarea rows="4" readonly spellcheck="false" ' +
      'aria-label="내보낼 JSON"></textarea><p class="pg-export-msg pg-note" role="status"></p>' +
      '<div class="pg-panel-acts"><button type="button" data-act="export-copy">복사</button>' +
      '<button type="button" data-act="export-close">닫기</button></div></div>' +
      '<div class="pg-import pg-panel" hidden><textarea rows="5" spellcheck="false" ' +
      'placeholder="내보낸 JSON 텍스트를 붙여넣으세요" aria-label="가져올 JSON"></textarea>' +
      '<p class="pg-import-msg pg-error" role="status"></p><div class="pg-panel-acts">' +
      '<button type="button" data-act="import-apply">불러오기</button>' +
      '<button type="button" data-act="import-cancel">취소</button></div></div>';
  }

  // Reads pasted 하드 JSON: { progress, presets } as exported, or a bare
  // progress object (then presets are left as they are). Returns null if
  // nothing usable is in it.
  function parseHardImport(text) {
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { return null; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if ('progress' in parsed || 'presets' in parsed) {
      var out = { progress: cleanProgress(parsed.progress), presets: cleanPresets(parsed.presets) };
      return Object.keys(out.progress).length || presetCount(out.presets) ? out : null;
    }
    var progress = cleanProgress(parsed);
    return Object.keys(progress).length ? { progress: progress, presets: null } : null;
  }

  // "육성상태 입력": the 하드 students with their progress, folded unless open.
  // Inside the fold (so only shown when open): 일괄 편집, or 저장 / 취소 while
  // editing (also repeated under the list).
  function hardFormHtml(progress, open, editing) {
    var students = hardStudents();
    var saveCancel = '<button type="button" class="pg-primary" data-act="edit-save">저장</button>' +
      '<button type="button" data-act="edit-cancel">취소</button>';
    return '<details class="st-fold hd-fold"' + (open ? ' open' : '') + '>' +
      '<summary class="st-section">육성상태 입력 <span class="st-count">' + students.length + '</span></summary>' +
      (editing ?
        '<div class="pg-tools is-editing"><span class="pg-tools-note">일괄 편집 중</span>' + saveCancel + '</div>' :
        '<div class="pg-tools"><button type="button" data-act="edit">일괄 편집</button></div>') +
      '<ul class="st-list">' + students.map(function (s) {
        var p = progress[s.name];
        var tag = editing ? 'div' : 'button';
        return '<li class="st-row" data-name="' + esc(s.name) + '" data-star="' + s.star + '">' +
          '<' + tag + (editing ? '' : ' type="button"') + ' class="st-main">' +
          '<span class="st-rarity" role="img" aria-label="초기 ' + s.star + '성">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + STAR_PATH + '"/></svg>' + s.star + '</span>' +
          '<span class="st-name">' + esc(s.name) + '</span><span class="st-extra">' +
          (editing ? editHtml(s.name, p, stagesFrom(s.star)) : '<span class="pg-state">' + stateText(p) + '</span>') +
          barHtml(p, ALL_STAGES) + '</span></' + tag + '></li>';
      }).join('') + '</ul>' +
      (editing ? '<div class="pg-tools pg-tools-end">' + saveCancel + '</div>' : '') +
      '</details>';
  }

  // Draws the 하드 tab: export/import, the progress list, the presets, then
  // the area table. Pointing at a table cell tints it and every other cell of
  // the same student (a tap does the same on touch screens). Tapping a student
  // row opens its editor. Progress (HARD_STORE_KEY) and presets
  // (HARD_PRESET_KEY) are the 하드 tab's own stores, separate from 숙련 증서.
  function mountHard(el) {
    var progress = loadProgress(HARD_STORE_KEY);
    var presets = loadPresets();
    var editing = false;
    var presetEditing = false;
    var presetDraft = null; // progress being edited on the preset table
    var showAll = false;
    function render() {
      var fold = el.querySelector('.hd-fold');
      el.innerHTML = hardToolsHtml() + hardFormHtml(progress, !!(fold && fold.open), editing) +
        hardPresetHtml(presets, presetEditing, presetEditing ? presetDraft : progress) +
        hardHtml(progress, showAll);
      var tabs = document.querySelector('.site-tabs');
      if (tabs && tabs.offsetHeight) el.style.setProperty('--site-tabs-h', tabs.offsetHeight + 'px');
      fitNameColumn(el);
    }
    render();
    root.addEventListener('route', function () { setTimeout(function () { fitNameColumn(el); }, 0); });
    el.addEventListener('toggle', function () { fitNameColumn(el); }, true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fitNameColumn(el); });

    function panel(sel) { return el.querySelector(sel); }
    function hidePanels() {
      Array.prototype.forEach.call(el.querySelectorAll('.pg-panel'), function (b) { b.hidden = true; });
    }
    function resetImport() {
      var box = panel('.pg-import');
      if (!box) return;
      var apply = box.querySelector('[data-act="import-apply"]');
      apply.classList.remove('is-armed');
      apply.textContent = '불러오기';
      var msg = box.querySelector('.pg-import-msg');
      msg.className = 'pg-import-msg pg-error';
      msg.textContent = '';
    }

    function copyExport() {
      var box = panel('.pg-export');
      var area = box.querySelector('textarea');
      var msg = box.querySelector('.pg-export-msg');
      function done() { msg.textContent = '복사했습니다.'; }
      function fallback() {
        area.focus();
        area.select();
        try { if (document.execCommand('copy')) { done(); return; } } catch (e) { /* ignore */ }
        msg.textContent = '자동 복사가 안 되니 선택된 내용을 직접 복사해 주세요.';
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(area.value).then(done, fallback);
      } else {
        fallback();
      }
    }

    // Replaces the saved progress (and presets, when included) with pasted
    // JSON; a second press confirms when something is already saved (no
    // confirm(): embedded views block it).
    function applyImport() {
      var box = panel('.pg-import');
      var msg = box.querySelector('.pg-import-msg');
      var next = parseHardImport(box.querySelector('textarea').value);
      if (!next) {
        resetImport();
        msg.textContent = '불러올 수 없는 내용입니다. 내보내기로 받은 JSON을 그대로 붙여넣어 주세요.';
        return;
      }
      var apply = box.querySelector('[data-act="import-apply"]');
      var hasSaved = Object.keys(progress).length || (next.presets && presetCount(presets));
      if (hasSaved && !apply.classList.contains('is-armed')) {
        apply.classList.add('is-armed');
        apply.textContent = '덮어쓰기';
        msg.className = 'pg-import-msg pg-note';
        msg.textContent = '저장된 진행 상황 ' + Object.keys(progress).length + '명' +
          (next.presets ? '·프리셋 ' + presetCount(presets) + '개' : '') + '를 붙여넣은 ' +
          Object.keys(next.progress).length + '명' + (next.presets ? '·프리셋 ' + presetCount(next.presets) + '개' : '') +
          '로 바꿉니다. 「덮어쓰기」를 한 번 더 누르면 적용됩니다.';
        return;
      }
      progress = next.progress;
      saveProgress(progress, HARD_STORE_KEY);
      if (next.presets) { presets = next.presets; savePresets(presets); }
      render();
    }

    // Bulk edit: read every 하드 row's controls and save them together.
    function saveEdits() {
      var next = {};
      Object.keys(progress).forEach(function (n) { next[n] = progress[n]; });
      Array.prototype.forEach.call(el.querySelectorAll('.hd-fold .st-row'), function (row) {
        var name = row.getAttribute('data-name');
        var stage = row.querySelector('.pg-stage-select').value;
        var held = row.querySelector('.pg-held-edit').value;
        if (!stage) { delete next[name]; return; }
        next[name] = [stage, stage === DONE ? 0 : Math.min(999, Math.max(0, Math.floor(+held || 0)))];
      });
      progress = next;
      saveProgress(progress, HARD_STORE_KEY);
    }

    // Preset edit: read the menus row by row; the progress edited alongside
    // (presetDraft) replaces the saved progress.
    function savePresetEdits() {
      progress = presetDraft;
      saveProgress(progress, HARD_STORE_KEY);
      var rows = Array.prototype.map.call(el.querySelectorAll('.hd-presets tbody'), function (group) {
        return Array.prototype.map.call(group.querySelectorAll('.hd-preset-select'), function (sel) { return sel.value; });
      });
      presets = cleanPresets(rows);
      savePresets(presets);
    }

    function onTool(name) {
      if (name === 'edit') {
        hidePanels(); closeEditors(el); presetEditing = false; editing = true; render(); return;
      }
      if (name === 'edit-cancel') { editing = false; render(); return; }
      if (name === 'edit-save') { saveEdits(); editing = false; render(); return; }
      if (name === 'preset-edit') {
        hidePanels(); closeEditors(el); editing = false;
        presetDraft = {};
        Object.keys(progress).forEach(function (n) { presetDraft[n] = progress[n]; });
        presetEditing = true; render(); return;
      }
      if (name === 'preset-cancel') { presetEditing = false; presetDraft = null; render(); return; }
      if (name === 'preset-save') { savePresetEdits(); presetEditing = false; render(); return; }
      if (name === 'export') {
        var ex = panel('.pg-export');
        panel('.pg-import').hidden = true;
        ex.hidden = !ex.hidden;
        ex.querySelector('.pg-export-msg').textContent = '';
        if (!ex.hidden) ex.querySelector('textarea').value = JSON.stringify({ progress: progress, presets: presets });
        return;
      }
      if (name === 'export-copy') { copyExport(); return; }
      if (name === 'export-close') { panel('.pg-export').hidden = true; return; }
      if (name === 'import') {
        var im = panel('.pg-import');
        panel('.pg-export').hidden = true;
        im.hidden = !im.hidden;
        resetImport();
        if (!im.hidden) im.querySelector('textarea').focus();
        return;
      }
      if (name === 'import-cancel') {
        panel('.pg-import').hidden = true;
        panel('.pg-import textarea').value = '';
        resetImport();
        return;
      }
      if (name === 'import-apply') applyImport();
    }

    var current = null;
    function mark(cell) {
      var name = cell ? cell.getAttribute('data-name') : null;
      if (name === current && cell && cell.classList.contains('is-hover')) return;
      Array.prototype.forEach.call(el.querySelectorAll('td.is-hover, td.is-match'), function (td) {
        td.classList.remove('is-hover', 'is-match');
      });
      current = name;
      if (!cell) return;
      Array.prototype.forEach.call(el.querySelectorAll('td[data-name]'), function (td) {
        if (td.getAttribute('data-name') === name) td.classList.add('is-match');
      });
      cell.classList.add('is-hover');
    }
    el.addEventListener('mouseover', function (ev) { mark(ev.target.closest('td[data-name]')); });
    el.addEventListener('mouseleave', function () { mark(null); });
    el.addEventListener('click', function (ev) {
      var t = ev.target;
      var editor = t.closest('.pg-editor');
      if (editor) {
        if (editorClick(editor, t, progress)) { saveProgress(progress, HARD_STORE_KEY); render(); }
        return;
      }
      var act = t.closest('.pg-tools [data-act], .pg-panel [data-act]');
      if (act) { onTool(act.getAttribute('data-act')); return; }
      var main = t.closest('.st-main');
      if (main) {
        if (editing) return;
        var row = main.parentNode;
        toggleRowEditor(el, row, progress, stagesFrom(+row.getAttribute('data-star')));
        return;
      }
      mark(t.closest('td[data-name]'));
    });
    function onInput(ev) {
      if (ev.target.matches('[data-act="show-all"]')) {
        if (ev.type === 'change') { showAll = ev.target.checked; render(); }
        return;
      }
      if (ev.target.closest('.pg-import')) { resetImport(); return; }
      if (presetEditing && ev.target.closest('.hd-presets')) { onPresetInput(ev.target); return; }
      var row = editing && ev.target.closest('.pg-edit') && ev.target.closest('.st-row');
      if (!row) return;
      var stage = row.querySelector('.pg-stage-select').value;
      var input = row.querySelector('.pg-held-edit');
      input.disabled = !stage || stage === DONE;
      if (input.disabled) input.value = '';
      var p = stage ? [stage, stage === DONE ? 0 : Math.max(0, Math.floor(+input.value || 0))] : undefined;
      row.querySelector('.pg-bar').outerHTML = barHtml(p, ALL_STAGES);
    }
    // Preset edit: picking a student loads their (draft) progress into the row;
    // changing a row's progress updates the draft and every row showing the
    // same student.
    function presetRowsOf(name) {
      return Array.prototype.filter.call(el.querySelectorAll('.hd-presets tbody tr'), function (tr) {
        var sel = tr.querySelector('.hd-preset-select');
        return sel && sel.value === name;
      });
    }
    function onPresetInput(target) {
      var tr = target.closest('tr');
      var sel = tr && tr.querySelector('.hd-preset-select');
      if (!sel) return;
      var name = sel.value;
      if (target === sel) {
        tr.querySelector('.hd-preset-state').innerHTML = presetProgressHtml(name, presetDraft, true);
        var group = tr.parentNode;
        var names = Array.prototype.map.call(group.querySelectorAll('.hd-preset-select'), function (x) { return x.value; });
        group.querySelector('.hd-preset-ap').outerHTML = presetApHtml(names);
        var all = Array.prototype.map.call(el.querySelectorAll('.hd-preset-select'), function (x) { return x.value; });
        el.querySelector('.hd-preset-total').outerHTML = presetTotalHtml([all]);
        return;
      }
      if (!name || !target.closest('.pg-edit')) return;
      var stage = tr.querySelector('.pg-stage-select').value;
      var input = tr.querySelector('.pg-held-edit');
      input.disabled = !stage || stage === DONE;
      if (input.disabled) input.value = '';
      if (stage) presetDraft[name] = [stage, stage === DONE ? 0 : Math.min(999, Math.max(0, Math.floor(+input.value || 0)))];
      else delete presetDraft[name];
      tr.querySelector('.pg-bar').outerHTML = barHtml(presetDraft[name], ALL_STAGES);
      presetRowsOf(name).forEach(function (other) {
        if (other !== tr) other.querySelector('.hd-preset-state').innerHTML = presetProgressHtml(name, presetDraft, true);
      });
    }

    el.addEventListener('input', onInput);
    el.addEventListener('change', onInput);
  }

  var api = { expertHtml: expertHtml, hardHtml: hardHtml, hardPresetHtml: hardPresetHtml, hardFormHtml: hardFormHtml,
    parseHardImport: parseHardImport, mount: mount, mountHard: mountHard, migrateNames: migrateNames };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ElephPage = api;
})(this);
