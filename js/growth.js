// 조각작 page, 숙련 증서 tab: limited, fest and distributed students in one
// list, ordered by the KR date each first appeared (newest first).
(function (root) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var KINDS = [
    { key: 'limited', label: '한정', cls: 'st-limited' },
    { key: 'fes', label: '페스', cls: 'st-fes' },
    { key: 'welfare', label: '배포', cls: 'st-welfare' }
  ];

  // One list of all students, newest first appearance first. Each row keeps
  // an empty slot on the right (.st-extra) for per-student information.
  // lists: Adapter.studentLists() output.
  function certHtml(lists) {
    var all = [];
    KINDS.forEach(function (k) {
      (lists[k.key] || []).forEach(function (s) { all.push({ name: s.name, first: s.first, kind: k }); });
    });
    all.sort(function (a, b) { return a.first < b.first ? 1 : a.first > b.first ? -1 : 0; });
    if (!all.length) return '<p class="page-empty">표시할 학생이 없습니다.</p>';
    return '<ul class="st-list">' + all.map(function (s) {
      return '<li class="st-row ' + s.kind.cls + '"><span class="st-tag">' + s.kind.label + '</span>' +
        '<span class="st-name">' + esc(s.name) + '</span><span class="st-extra"></span></li>';
    }).join('') + '</ul>';
  }

  var api = { certHtml: certHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GrowthPage = api;
})(this);
