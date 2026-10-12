// Events page: a table of event titles with the KR dates of their first run
// (신규), reruns (복각) and permanent release (상설), newest first-run on top.
(function (root) {
  'use strict';

  var Timeline = typeof module !== 'undefined' && module.exports ? require('./render.js') : root.Timeline;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // "2026-10-13" -> "26.10.13"
  function shortDay(day) {
    var p = day.split('-');
    return p[0].slice(2) + '.' + p[1] + '.' + p[2];
  }

  function nameHtml(e) {
    var t = Timeline.splitTitle(e.name);
    return '<span class="ev-main">' + esc(t.main) + '</span>' +
      (t.sub ? '<span class="ev-sub">~' + esc(t.sub) + '~</span>' : '') +
      (e.welfare ? '<span class="ev-welfare"><span class="ev-welfare-label">배포</span>' +
        esc(e.welfare) + '</span>' : '');
  }

  function dayHtml(day) {
    return '<time class="ev-day" datetime="' + day + '">' + shortDay(day) + '</time>';
  }

  function cellHtml(days) {
    if (!days.length) return '<td class="ev-date"><span class="ev-none">–</span></td>';
    return '<td class="ev-date">' + days.map(dayHtml).join('') + '</td>';
  }

  // list: Adapter.eventHistory() output.
  function html(list) {
    if (!list.length) return '<p class="page-empty">표시할 이벤트가 없습니다.</p>';
    return '<table class="ev-table"><thead><tr>' +
      '<th scope="col" class="ev-name-col">이벤트</th>' +
      '<th scope="col">신규</th><th scope="col">복각</th><th scope="col">상설</th>' +
      '</tr></thead><tbody>' + list.map(function (e) {
        return '<tr><th scope="row" class="ev-name">' + nameHtml(e) + '</th>' +
          cellHtml(e.first ? [e.first] : []) +
          cellHtml(e.reruns) +
          cellHtml(e.permanent ? [e.permanent] : []) + '</tr>';
      }).join('') + '</tbody></table>';
  }

  var api = { html: html, shortDay: shortDay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EventsPage = api;
})(this);
