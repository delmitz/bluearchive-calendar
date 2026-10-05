// Entry point: fetches the published sheet tabs, converts them to EVENTS
// and renders the timeline. "Load earlier" reveals older weeks client-side.
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
      events = Adapter.sheetRowsToEvents(Adapter.csvToRecords(texts[0]), schema, {
        warn: function (msg) { console.warn('[timeline] ' + msg); }
      });
      fromT = todayT() - PAGE_WEEKS * WEEK_MS;
      render();
    }).catch(function (err) {
      console.error(err);
      timelineEl.innerHTML = '';
      setStatus('일정을 불러오지 못했습니다.', true);
    });
  }

  loadMoreButton.addEventListener('click', function () {
    fromT -= PAGE_WEEKS * WEEK_MS;
    render();
  });

  window.addEventListener('resize', function () { Timeline.layout(timelineEl); });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { Timeline.layout(timelineEl); });
  }

  load();
})();
