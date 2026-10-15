// 조각작 page, 숙련 증서 tab: limited, fest and distributed students. Students
// not yet sold in the 숙련 증서 shop come first under "추가예정" (newest
// first appearance first); the rest follow by newest shop addition, with a
// "n월 추가" badge on students whose KR shop addition is still ahead (already
// added in JP, KR date estimated).
(function (root) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // The kind of student is shown by the row background only.
  var KINDS = { limited: 'st-limited', fes: 'st-fes', welfare: 'st-welfare' };

  // "2026-12-01" -> "12월 추가"
  function addedText(day) {
    return +day.split('-')[1] + '월 추가';
  }

  // Each row keeps an empty slot on the right (.st-extra) for per-student
  // information.
  function listHtml(students, today) {
    return '<ul class="st-list">' + students.map(function (s) {
      var upcoming = s.shop && today && s.shop > today;
      return '<li class="st-row ' + KINDS[s.kind] + '">' +
        '<span class="st-name">' + esc(s.name) +
        (upcoming ? '<time class="st-date" datetime="' + s.shop + '">' + addedText(s.shop) + '</time>' : '') +
        '</span><span class="st-extra"></span></li>';
    }).join('') + '</ul>';
  }

  // data: Adapter.certStudents() output. today: "YYYY-MM-DD".
  function certHtml(data, today) {
    if (!data.pending.length && !data.added.length) return '<p class="page-empty">표시할 학생이 없습니다.</p>';
    return (data.pending.length ? '<p class="st-section">추가예정</p>' + listHtml(data.pending, today) : '') +
      (data.added.length ? listHtml(data.added, today) : '');
  }

  var api = { certHtml: certHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GrowthPage = api;
})(this);
