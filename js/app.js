// Entry point: fetches the published sheet tabs, converts them to EVENTS
// and renders the timeline from the events running today on. "Load earlier"
// reveals older weeks client-side.
(function () {
  'use strict';

  var SHEET_BASE = 'https://docs.google.com/spreadsheets/d/e/' +
    '2PACX-1vTLF8WoYAIyohElpuf24xg8IR_ncqW5BxUsR8xwIXL5ycstrPpvSwUnW9GYc6J2q6Ld5MKG2pmpcTWC' +
    '/pub?single=true&output=csv&gid=';
  var SCHEDULE_GID = '0';
  var SCHEMA_GID = '726510917';
  var PAGE_WEEKS = 6;
  var WEEK_MS = 7 * 86400000;

  var app = document.getElementById('app');
  var statusEl = document.getElementById('status');
  var timelineEl = document.getElementById('timeline');
  var loadMoreEl = document.getElementById('load-more');
  var loadMoreButton = document.getElementById('load-more-button');

  var eventsPageEl = document.getElementById('events-page');
  var expertPageEl = document.getElementById('expert-page');
  // The 하드 table is fixed data, drawn without waiting for the sheet.
  ElephPage.mountHard(document.getElementById('hard-page'));

  var events = [];
  var fromT = null;

  // Follow the device color scheme.
  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    app.classList.toggle('theme-dark', darkQuery.matches);
    app.classList.toggle('theme-light', !darkQuery.matches);
  }
  applyTheme();
  if (darkQuery.addEventListener) darkQuery.addEventListener('change', applyTheme);
  else darkQuery.addListener(applyTheme);

  function todayT() {
    var d = new Date();
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // Earliest start among events still running today (start before today,
  // last day today or later), so the first view begins with them. Raids are
  // skipped: a running raid's start may be hidden, its end line still shows.
  function initialFrom(list, today) {
    var from = today;
    list.forEach(function (e) {
      if (!e.end || e.type === 'raid') return;
      var start = Timeline.parseDay(e.start);
      if (start < from && Timeline.parseDay(e.end) >= today) from = start;
    });
    return from;
  }

  function setStatus(text, retry) {
    statusEl.hidden = !text;
    statusEl.textContent = text || '';
    if (retry) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = '다시 시도';
      b.addEventListener('click', load);
      statusEl.appendChild(document.createElement('br'));
      statusEl.appendChild(b);
    }
  }

  function render() {
    var view = Timeline.buildRows(events, fromT);
    timelineEl.innerHTML = Timeline.rowsHtml(view.rows);
    Timeline.layout(timelineEl);
    loadMoreEl.hidden = !view.hasEarlier;
    setStatus(view.rows.length ? '' : '표시할 일정이 없습니다.');
  }

  function fetchText(gid) {
    return fetch(SHEET_BASE + gid).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    });
  }

  function load() {
    setStatus('일정을 불러오는 중…');
    loadMoreEl.hidden = true;
    Promise.all([fetchText(SCHEDULE_GID), fetchText(SCHEMA_GID)]).then(function (texts) {
      var schema = Adapter.buildSchema(Adapter.csvToRecords(texts[1]));
      var records = Adapter.csvToRecords(texts[0]);
      eventsPageEl.innerHTML = EventsPage.html(Adapter.eventHistory(records, schema));
      ElephPage.mount(expertPageEl, Adapter.expertStudents(records, schema),
        new Date(todayT()).toISOString().slice(0, 10));
      events = Adapter.sheetRowsToEvents(records, schema, {
        warn: function (msg) { console.warn('[timeline] ' + msg); }
      });
      fromT = initialFrom(events, todayT());
      render();
    }).catch(function (err) {
      console.error(err);
      timelineEl.innerHTML = '';
      eventsPageEl.innerHTML = '<p class="page-empty">이벤트를 불러오지 못했습니다.</p>';
      expertPageEl.innerHTML = '<p class="page-empty">학생 목록을 불러오지 못했습니다.</p>';
      setStatus('일정을 불러오지 못했습니다.', true);
    });
  }

  loadMoreButton.addEventListener('click', function () {
    fromT -= PAGE_WEEKS * WEEK_MS;
    render();
  });

  // Note popover: clicking a note icon (.memo-btn) shows its row's 메모
  // below the icon (above it when there is no room); clicking elsewhere,
  // Escape, scrolling or resizing closes it.
  var memoPop = null;
  function closeMemo() {
    if (!memoPop) return;
    memoPop.btn.setAttribute('aria-expanded', 'false');
    memoPop.el.remove();
    memoPop = null;
  }
  function openMemo(btn) {
    var el = document.createElement('div');
    el.className = 'memo-pop';
    el.setAttribute('role', 'note');
    el.textContent = btn.getAttribute('data-memo');
    app.appendChild(el);
    var r = btn.getBoundingClientRect();
    var w = el.offsetWidth, h = el.offsetHeight;
    var top = r.bottom + 6;
    if (top + h > window.innerHeight - 8 && r.top - 6 - h > 8) top = r.top - 6 - h;
    el.style.top = top + 'px';
    el.style.left = Math.max(8, Math.min(r.left - 8, window.innerWidth - w - 8)) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    memoPop = { el: el, btn: btn };
  }
  document.addEventListener('click', function (e) {
    if (memoPop && memoPop.el.contains(e.target)) return;
    var btn = e.target.closest ? e.target.closest('.memo-btn') : null;
    var wasOpen = memoPop && memoPop.btn === btn;
    closeMemo();
    if (btn && !wasOpen) openMemo(btn);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMemo(); });
  window.addEventListener('scroll', closeMemo, true);
  window.addEventListener('resize', closeMemo);

  window.addEventListener('resize', function () { Timeline.layout(timelineEl); });
  // Layout needs the page to be visible; redo it when the timeline tab opens.
  window.addEventListener('route', function (e) {
    if (e.detail === 'timeline') Timeline.layout(timelineEl);
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { Timeline.layout(timelineEl); });
  }

  load();
})();
