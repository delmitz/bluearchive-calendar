// Converts the published Google Sheet CSVs (schedule + attribute schema)
// into the EVENTS structure the timeline renderer consumes.
// Pure functions only: usable from the browser (window.Adapter) and Node (require).
(function (root) {
  'use strict';

  var DAY_MS = 86400000;
  // Dates follow the Korean server schedule.
  var COL = { start: '한섭시작일자', end: '한섭종료일자', type: '종류' };
  var SCHEMA_TYPE_COL = '종류';
  var ARMOR_KEYS = { '경장갑': 'light', '중장갑': 'heavy', '특수장갑': 'special', '탄력장갑': 'elastic' };
  var PICKUP_KIND = { '신규': 'new', '복각': 'rerun' };
  var PICKUP_TIER = { '통상': 'normal', '한정': 'limited', '페스': 'fes' };
  var EVENT_KIND = { '신규': 'new', '복각': 'rerun' };

  // Attribute meanings (as written in the schema tab) each type needs.
  // Positions are never hardcoded: they are resolved through the schema tab.
  var REQUIRED = {
    '이벤트': ['제목', '신규/복각'],
    '메인스토리': ['제목'],
    '제약해제결전': ['보스', '방어타입'],
    '픽업': ['캐릭터1', '캐릭터2', '신규/복각', '통상/한정/페스'],
    '총력전': ['보스', '방어타입'],
    '대결전': ['보스', '상위방어타입', '하위방어타입'],
    '캠페인': ['2배/3배', '항목1', '항목2'],
    '종합전술시험': ['사격/돌파/방어/호위'],
    '미니스토리': ['제목'],
    '그룹스토리': ['제목'],
    '가이드미션': ['제목'],
    '이벤트(상설)': ['이벤트명'],
    '업데이트': ['내용'],
    '애용품': ['캐릭터1']
  };
  // Types intentionally not shown on the timeline.
  var HIDDEN_TYPES = { '패키지판매': true };

  // RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF, no trailing newline.
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = '';
    var quoted = false;
    var s = String(text).replace(/^﻿/, '');
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (quoted) {
        if (c === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
        } else {
          field += c;
        }
      } else if (c === '"') {
        quoted = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else {
        field += c;
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  // CSV text -> array of objects keyed by the header row.
  function csvToRecords(text) {
    var rows = parseCSV(text);
    if (!rows.length) return [];
    var header = rows[0].map(function (h) { return h.trim(); });
    return rows.slice(1).map(function (r) {
      var rec = {};
      header.forEach(function (h, i) { if (h) rec[h] = (r[i] || '').trim(); });
      return rec;
    });
  }

  // Schema tab records -> { type: { meaning: column header } }.
  function buildSchema(records) {
    var schema = {};
    records.forEach(function (rec) {
      var type = rec[SCHEMA_TYPE_COL];
      if (!type) return;
      var map = {};
      Object.keys(rec).forEach(function (col) {
        if (col !== SCHEMA_TYPE_COL && rec[col]) map[rec[col]] = col;
      });
      schema[type] = map;
    });
    return schema;
  }

  // Column of an attribute meaning. A schema name may extend the meaning
  // (e.g. "신규/복각/상설" for "신규/복각"), so a prefix match is accepted.
  function column(map, meaning) {
    if (map[meaning]) return map[meaning];
    var key = Object.keys(map).filter(function (k) { return k.indexOf(meaning) === 0; })[0];
    return key ? map[key] : '';
  }

  function parseDay(s) {
    var p = s.split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(t) {
    var d = new Date(t);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function md(t) { var d = new Date(t); return pad(d.getUTCMonth() + 1) + '.' + pad(d.getUTCDate()); }
  function isDay(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }
  // Sheet dates may be published in any display format (e.g. "2026. 6. 10. (수)");
  // normalize year/month/day to YYYY-MM-DD, or '' when there is no date.
  function normDay(s) {
    var m = String(s || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    return m ? m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]) : '';
  }

  function armorList(value) {
    return String(value || '').split(',').map(function (a) { return ARMOR_KEYS[a.trim()]; })
      .filter(Boolean);
  }

  // Sheet end dates are maintenance days (exclusive); EVENTS end dates are inclusive.
  function inclusiveEnd(sheetEnd) { return iso(parseDay(sheetEnd) - DAY_MS); }

  function sheetRowsToEvents(records, schema, options) {
    var warn = (options && options.warn) || function () {};
    var rows = [];
    records.forEach(function (rec, order) {
      var type = rec[COL.type];
      var start = normDay(rec[COL.start]);
      if (!type || !isDay(start)) return;
      if (HIDDEN_TYPES[type]) return;
      var map = schema[type];
      if (!map) { warn('Type not defined in schema, row skipped: ' + type); return; }
      var need = REQUIRED[type];
      if (!need) { warn('Type has no display rule, row skipped: ' + type); return; }
      var missing = need.filter(function (m) { return !column(map, m); });
      if (missing.length) {
        warn('Schema for ' + type + ' lacks ' + missing.join(', ') + ', row skipped');
        return;
      }
      var end = normDay(rec[COL.end]);
      rows.push({
        order: order, type: type, start: start, end: end,
        t: parseDay(start), endT: end ? parseDay(end) : null,
        get: function (meaning) { var c = column(map, meaning); return c ? (rec[c] || '') : ''; }
      });
    });

    var out = [];
    var cards = [];

    function newCard(type, start, sheetEnd, name) {
      var card = {
        type: type, start: start, end: inclusiveEnd(sheetEnd), name: name,
        _t: parseDay(start), _endT: parseDay(sheetEnd)
      };
      cards.push(card);
      out.push(card);
      return card;
    }

    // Pass 1: events, main stories, unrestricted raids.
    rows.forEach(function (r) {
      if (r.type === '이벤트') {
        if (r.get('신규/복각') === '상설') return;  // permanent: a text line (pass 3)
        if (!r.end) { warn('Event without an end date skipped: ' + r.get('제목')); return; }
        var kind = EVENT_KIND[r.get('신규/복각')] || 'new';
        newCard(kind, r.start, r.end, r.get('제목'));
      } else if (r.type === '메인스토리') {
        out.push({ type: 'story', start: r.start, name: r.get('제목') });
      } else if (r.type === '제약해제결전') {
        if (!r.end) return;
        // Raids open the day before the date written in the sheet.
        out.push({ type: 'raid', start: iso(r.t - DAY_MS), end: inclusiveEnd(r.end),
          name: r.get('보스'), armor: armorList(r.get('방어타입')) });
      }
    });

    function findCard(r) {
      var found = null;
      cards.forEach(function (c) {
        if (c._t <= r.t && r.t < c._endT && (!found || c._t >= found._t)) found = c;
      });
      return found;
    }

    // Whole period when the row spans the card exactly, otherwise the week it starts in.
    function slot(card, r) {
      if (r.t === card._t && r.endT === card._endT) return card;
      card.weeks = card.weeks || [];
      var w = Math.floor((r.t - card._t) / (7 * DAY_MS));
      while (card.weeks.length <= w) card.weeks.push({});
      return card.weeks[w];
    }
    function push(target, key, value) { (target[key] = target[key] || []).push(value); }

    function placeOrGap(r, key, value) {
      var card = findCard(r);
      if (!card) {
        if (!r.end) return;
        var gapKey = r.start + '|' + r.end;
        card = cards.filter(function (c) { return c._gapKey === gapKey; })[0];
        if (!card) { card = newCard('gap', r.start, r.end, ''); card._gapKey = gapKey; }
      }
      push(slot(card, r), key, value);
    }

    // Pass 2: pickups and battles (these may create gap cards).
    rows.forEach(function (r) {
      if (r.type === '픽업') {
        var kind = PICKUP_KIND[r.get('신규/복각')] || 'new';
        var tier = PICKUP_TIER[r.get('통상/한정/페스')] || 'normal';
        // Characters sharing one sheet row are shown together on one line.
        var names = [r.get('캐릭터1'), r.get('캐릭터2')].filter(Boolean);
        if (names.length) placeOrGap(r, 'pickups', { name: names.join(', '), kind: kind, tier: tier });
      } else if (r.type === '총력전') {
        placeOrGap(r, 'battles', { type: 'total', boss: r.get('보스'), armor: armorList(r.get('방어타입')) });
      } else if (r.type === '종합전술시험') {
        placeOrGap(r, 'battles', { type: 'tactical', boss: r.get('사격/돌파/방어/호위'), armor: [] });
      } else if (r.type === '대결전') {
        placeOrGap(r, 'battles', { type: 'grand', boss: r.get('보스'),
          armor: [armorList(r.get('상위방어타입')), armorList(r.get('하위방어타입'))] });
      }
    });

    // Pass 3: sub-event text lines. Rows without an end date go into the
    // story block of their start day (the main story, or a text-only block);
    // the rest go into their card and are dropped when no card contains them.
    rows.forEach(function (r) {
      var text = subText(r);
      if (!text) return;
      if (!r.end) {
        var story = out.filter(function (e) { return e.type === 'story' && e.start === r.start; })[0];
        if (!story) { story = { type: 'story', start: r.start, name: '' }; out.push(story); }
        push(story, 'fullSubs', text);
        return;
      }
      var card = findCard(r);
      if (!card) return;
      var target = slot(card, r);
      push(target, target === card ? 'fullSubs' : 'subs', text);
    });

    out.forEach(function (e) {
      delete e._t; delete e._endT; delete e._gapKey;
    });
    return out;
  }

  // Sub-event line as { label, text }: the label is the kind (or the
  // campaign rate) shown slightly emphasized before the text.
  function line(label, text) { return text ? { label: label, text: text } : ''; }
  function subText(r) {
    switch (r.type) {
      case '캠페인': {
        var items = [r.get('항목1'), r.get('항목2')].filter(Boolean).join('·');
        if (!items) return '';
        if (r.end && (r.endT - r.t) / DAY_MS < 7) {
          items += ' (' + md(r.t) + '–' + md(r.endT - DAY_MS) + ')';
        }
        return line(r.get('2배/3배'), items);
      }
      case '미니스토리': return r.get('제목') ? line('미니스토리', '「' + r.get('제목') + '」') : '';
      case '그룹스토리': {
        // Group stories repeat names across releases; the episode range tells them apart.
        var ep = r.get('화수');
        return r.get('제목') ? line('그룹스토리', '「' + r.get('제목') + '」' + (ep ? ' ' + ep + '화' : '')) : '';
      }
      case '이벤트(상설)': return line('상설 이벤트', r.get('이벤트명'));
      case '이벤트': return r.get('신규/복각') === '상설' ? line('상설 이벤트', r.get('제목')) : '';
      case '애용품': {
        var names = [1, 2, 3, 4, 5].map(function (i) { return r.get('캐릭터' + i); }).filter(Boolean);
        return line('애용품', names.join(' · '));
      }
      case '업데이트': return line('업데이트', r.get('내용'));
      case '가이드미션': return line('가이드미션', r.get('제목'));
      default: return '';
    }
  }

  var api = {
    parseCSV: parseCSV,
    csvToRecords: csvToRecords,
    buildSchema: buildSchema,
    sheetRowsToEvents: sheetRowsToEvents
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Adapter = api;
})(this);
