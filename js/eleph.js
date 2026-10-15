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

  // Edit mode controls in place of the stars and count: a stage menu
  // ("–" clears) and the elephs held (off for 전4 and "–").
  function editHtml(name, p) {
    var cur = p ? p[0] : '';
    var off = !p || p[0] === DONE;
    return '<span class="pg-edit"><select class="pg-stage-select" aria-label="' + esc(name) + ' 목표 단계">' +
      '<option value=""' + (cur ? '' : ' selected') + '>–</option>' + STAGE_KEYS.map(function (k) {
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

  function listHtml(students, today, progress, editing) {
    return '<ul class="st-list">' + students.map(function (s) {
      return rowHtml(s, today, progress, editing);
    }).join('') + '</ul>';
  }

  function sectionHtml(label, count) {
    return '<p class="st-section">' + label + ' <span class="st-count">' + count + '</span></p>';
  }

  // data: Adapter.expertStudents() output. today: "YYYY-MM-DD".
  // progress: { name: [stage, held] }. pendingOpen: show 추가예정 unfolded.
  // editing: every row shows stage and count controls, saved all at once.
  function expertHtml(data, today, progress, pendingOpen, editing) {
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
      (added.length ? sectionHtml('판매 목록', added.length) + list(added) : '') +
      (done.length ? sectionHtml('성장 완료', done.length) + list(done) : '') +
      // A second save/cancel pair at the end of the lists.
      (editing ? '<div class="pg-tools pg-tools-end">' +
        '<button type="button" class="pg-primary" data-act="edit-save">저장</button>' +
        '<button type="button" data-act="edit-cancel">취소</button></div>' : '');
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
  var STORE_KEY = 'expertProgress.v1';
  var OLD_STORE_KEYS = ['certProgress.v1']; // earlier key, moved on first load

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
      if (!raw && root.localStorage) {
        OLD_STORE_KEYS.some(function (k) {
          raw = root.localStorage.getItem(k);
          if (!raw) return false;
          root.localStorage.setItem(STORE_KEY, raw);
          root.localStorage.removeItem(k);
          return true;
        });
      }
      if (raw) {
        var saved = JSON.parse(raw) || {};
        if (migrateNames(saved)) saveProgress(saved);
        return saved;
      }
    } catch (e) { /* storage unavailable: start empty */ }
    return {};
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
    var editing = false;
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
      el.innerHTML = expertHtml(data, today, progress, !!(fold && fold.open), editing);
      var tabs = document.querySelector('.site-tabs');
      if (tabs && tabs.offsetHeight) el.style.setProperty('--site-tabs-h', tabs.offsetHeight + 'px');
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
      saveProgress(progress);
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
          // Toolbar and panels are controls, not content.
          filter: function (node) {
            return !(node.classList && (node.classList.contains('pg-tools') || node.classList.contains('pg-panel')));
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
      saveProgress(progress);
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
      var row = main.parentNode;
      var wasOpen = row.classList.contains('is-editing');
      closeEditor();
      if (wasOpen) return;
      row.classList.add('is-editing');
      row.insertAdjacentHTML('beforeend', editorHtml(progress[row.getAttribute('data-name')]));
    };

    el.oninput = function (ev) {
      if (ev.target.closest('.pg-import')) { resetImport(); return; }
      var row = editing && ev.target.closest('.st-row');
      if (row && ev.target.closest('.pg-edit')) onEditInput(row);
    };
    el.onchange = el.oninput;

  }

  var api = { expertHtml: expertHtml, mount: mount, migrateNames: migrateNames };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ElephPage = api;
})(this);
