// Converts the published Google Sheet CSVs (schedule + attribute schema)
// into the EVENTS structure the timeline renderer consumes.
// Pure functions only: usable from the browser (window.Adapter) and Node (require).
(function (root) {
  'use strict';

  var DAY_MS = 86400000;
  // Dates follow the Korean server schedule.
  var COL = { start: '한섭시작일자', end: '한섭종료일자', type: '종류', memo: '메모' };
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
    '총결산': ['형식'],
    '기한 만료': ['내용'],
    '상점': ['대상 상점', '캐릭터 목록'],
    '이벤트(상설)': ['이벤트명'],
    '업데이트': ['내용'],
    '애용품': ['캐릭터1']
  };
  // Campaign items for account experience (KR official: 계정 경험치).
  var EXP_ITEMS = { '계정 경험치': true, '경험치': true };
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
  var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  function wd(t) { return WEEKDAYS[new Date(t).getUTCDay()]; }
  // Short period as weekdays: "[토~일]", or "[토]" for a single day.
  function weekdayRange(t, lastT) { return ' [' + wd(t) + (lastT > t ? '~' + wd(lastT) : '') + ']'; }
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
        memo: rec[COL.memo] || '',
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
        var card = newCard(kind, r.start, r.end, r.get('제목'));
        // The one student given out by the event, when the sheet names one.
        if (r.get('배포캐릭터')) card.welfare = r.get('배포캐릭터');
        withMemo(card, r);
      } else if (r.type === '메인스토리') {
        var ep = r.get('화수');
        out.push(withMemo(ep ? { type: 'story', start: r.start, name: r.get('제목'), episodes: ep }
          : { type: 'story', start: r.start, name: r.get('제목') }, r));
      } else if (r.type === '제약해제결전') {
        if (!r.end) return;
        // Raids open the day before the date written in the sheet.
        out.push(withMemo({ type: 'raid', start: iso(r.t - DAY_MS), end: inclusiveEnd(r.end),
          name: r.get('보스'), terrain: r.get('지형'), armor: armorList(r.get('방어타입')) }, r));
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
      withMemo(value, r);
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
        placeOrGap(r, 'battles', { type: 'total', boss: r.get('보스'), terrain: r.get('지형'),
          armor: armorList(r.get('방어타입')) });
      } else if (r.type === '종합전술시험') {
        placeOrGap(r, 'battles', { type: 'tactical', boss: r.get('사격/돌파/방어/호위'),
          terrain: r.get('지형'), armor: [] });
      } else if (r.type === '대결전') {
        placeOrGap(r, 'battles', { type: 'grand', boss: r.get('보스'), terrain: r.get('지형'),
          armor: [armorList(r.get('상위방어타입')), armorList(r.get('하위방어타입'))] });
      }
    });

    // Pass 3: sub-event text lines. Rows without an end date go into the
    // story block of their start day (the main story, or a text-only block);
    // the rest go into their card and are dropped when no card contains them.
    // Rate campaigns (2배, 3배, ...) of the same rate in the same list share
    // one line; campaigns without a rate keep their own line.
    var campaigns = [];
    rows.forEach(function (r) {
      var text = subText(r);
      if (!text) return;
      var target, key;
      if (!r.end) {
        target = out.filter(function (e) { return e.type === 'story' && e.start === r.start; })[0];
        if (!target) { target = { type: 'story', start: r.start, name: '' }; out.push(target); }
        key = 'fullSubs';
      } else {
        var card = findCard(r);
        if (!card) return;
        target = slot(card, r);
        key = target === card ? 'fullSubs' : 'subs';
      }
      var list = target[key] = target[key] || [];
      if (r.type === '캠페인' && r.get('2배/3배')) {
        var rate = r.get('2배/3배');
        // Experience campaigns always get their own line, below the others.
        var exp = EXP_ITEMS[r.get('항목1')] || EXP_ITEMS[r.get('항목2')] || false;
        var c = campaigns.filter(function (x) { return x.list === list && x.rate === rate && x.exp === exp; })[0];
        if (!c) {
          c = { list: list, rate: rate, exp: exp, order: campaigns.length, groups: [], line: { label: rate } };
          campaigns.push(c);
          list.push(c.line);
        }
        addCampaign(c, r);
        return;
      }
      list.push(withMemo(text, r));
    });
    sortCampaignLines(campaigns);

    out.forEach(function (e) {
      delete e._t; delete e._endT; delete e._gapKey;
    });
    return out;
  }

  // Sets the row's 메모 (free note) on the displayed object, when it has one.
  function withMemo(obj, r) {
    if (r.memo) obj.memo = r.memo;
    return obj;
  }

  // Sub-event line as { label, text }: the label is the kind (or the
  // campaign rate) shown slightly emphasized before the text.
  function line(label, text) { return text ? { label: label, text: text } : ''; }
  function campaignItems(r) { return [r.get('항목1'), r.get('항목2')].filter(Boolean).join('·'); }

  // Adds a campaign row to the line of its rate. Rows with the same period
  // join one group ("A·B"); groups are separated by ", ", full-length groups
  // first, then short ones by start date, each followed by its weekdays.
  function addCampaign(c, r) {
    // A shared line collects the notes of all its rows, one per line.
    if (r.memo && (c.line.memo || '').split('\n').indexOf(r.memo) < 0) {
      c.line.memo = c.line.memo ? c.line.memo + '\n' + r.memo : r.memo;
    }
    var period = r.start + '|' + (r.end || '');
    var short = !!r.end && (r.endT - r.t) / DAY_MS < 7;
    var g = c.groups.filter(function (x) { return x.period === period; })[0];
    if (g) g.items += '·' + campaignItems(r);
    else c.groups.push({ period: period, t: r.t, short: short, items: campaignItems(r),
      suffix: short ? weekdayRange(r.t, r.endT - DAY_MS) : '' });
    c.groups.sort(function (a, b) { return (a.short - b.short) || (a.t - b.t); });
    c.line.text = c.groups.map(function (x) { return x.items + x.suffix; }).join(', ');
  }

  // Within each list, campaign lines that have a full-length group come
  // first, then by earliest start; other lines keep their positions.
  // Experience lines are moved to the end of the list.
  function sortCampaignLines(campaigns) {
    var lists = [];
    campaigns.forEach(function (c) { if (lists.indexOf(c.list) < 0) lists.push(c.list); });
    lists.forEach(function (list) {
      var mine = campaigns.filter(function (c) { return c.list === list && !c.exp; });
      var exp = campaigns.filter(function (c) { return c.list === list && c.exp; });
      var key = function (c) {
        return { full: c.groups.some(function (g) { return !g.short; }) ? 0 : 1,
          t: Math.min.apply(null, c.groups.map(function (g) { return g.t; })) };
      };
      var sorted = mine.slice().sort(function (a, b) {
        var ka = key(a), kb = key(b);
        return (ka.full - kb.full) || (ka.t - kb.t) || (a.order - b.order);
      });
      var slots = [];
      list.forEach(function (v, i) { if (mine.some(function (c) { return c.line === v; })) slots.push(i); });
      slots.forEach(function (i, k) { list[i] = sorted[k].line; });
      exp.forEach(function (c) { list.splice(list.indexOf(c.line), 1); list.push(c.line); });
    });
  }

  function subText(r) {
    switch (r.type) {
      case '캠페인': return campaignItems(r) ? line(r.get('2배/3배'), campaignItems(r)) : '';
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
      case '기한 만료': return line('기한 만료', r.get('내용'));
      // Students whose elephs were added to a shop: "숙련 증서 상점" + list.
      case '상점': return r.get('대상 상점') ? line(r.get('대상 상점') + ' 상점', r.get('캐릭터 목록')) : '';
      // Shown with the full in-game name; 형식 is the reward format.
      case '총결산': return line('샬레 총결산 with 총학생회', r.get('형식'));
      default: return '';
    }
  }

  // Event history for the events page: one entry per event title with the
  // KR start of its first run (신규), reruns (복각) and permanent release
  // (상설) and the distributed student (배포캐릭터, from any of its rows),
  // newest first-run first. Titles without a first-run row sort by their
  // earliest date.
  function eventHistory(records, schema) {
    var map = schema['이벤트'];
    if (!map) return [];
    var titleCol = column(map, '제목'), kindCol = column(map, '신규/복각');
    var welfareCol = column(map, '배포캐릭터');
    if (!titleCol || !kindCol) return [];
    var byName = {};
    var list = [];
    records.forEach(function (rec) {
      if (rec[COL.type] !== '이벤트') return;
      var name = rec[titleCol], start = normDay(rec[COL.start]);
      if (!name || !start) return;
      var e = byName[name];
      if (!e) { e = byName[name] = { name: name, first: '', reruns: [], permanent: '', welfare: '' }; list.push(e); }
      if (welfareCol && rec[welfareCol] && !e.welfare) e.welfare = rec[welfareCol];
      var kind = rec[kindCol];
      if (kind === '복각') e.reruns.push(start);
      else if (kind === '상설') { if (!e.permanent || start < e.permanent) e.permanent = start; }
      else if (!e.first || start < e.first) e.first = start;
    });
    list.forEach(function (e) {
      e.reruns.sort();
      e._key = e.first || [e.reruns[0], e.permanent].filter(Boolean).sort()[0] || '';
    });
    list.sort(function (a, b) { return a._key < b._key ? 1 : a._key > b._key ? -1 : 0; });
    list.forEach(function (e) { delete e._key; });
    return list;
  }

  // Students for the expert permit page: limited (한정) and fest (페스)
  // pickup students and event-distributed students (배포캐릭터), each with the
  // KR date they first appeared (earliest pickup or event start), newest first.
  // Companion students joined with "&" are listed one by one.
  function studentLists(records, schema) {
    var lists = { limited: {}, fes: {}, welfare: {} };
    function add(list, name, day) {
      name = name.trim();
      if (!name || !day) return;
      if (!list[name] || day < list[name]) list[name] = day;
    }
    var pick = schema['픽업'], ev = schema['이벤트'];
    records.forEach(function (rec) {
      var day = normDay(rec[COL.start]);
      if (rec[COL.type] === '픽업' && pick) {
        var tier = rec[column(pick, '통상/한정/페스')];
        var list = tier === '한정' ? lists.limited : tier === '페스' ? lists.fes : null;
        if (!list) return;
        [column(pick, '캐릭터1'), column(pick, '캐릭터2')].forEach(function (c) {
          if (c) (rec[c] || '').split('&').forEach(function (n) { add(list, n, day); });
        });
      } else if (rec[COL.type] === '이벤트' && ev) {
        var wc = column(ev, '배포캐릭터');
        if (wc) add(lists.welfare, rec[wc] || '', day);
      }
    });
    function sorted(list) {
      return Object.keys(list).map(function (n) { return { name: n, first: list[n] }; })
        .sort(function (a, b) { return a.first < b.first ? 1 : a.first > b.first ? -1 : (a.name < b.name ? -1 : 1); });
    }
    return { limited: sorted(lists.limited), fes: sorted(lists.fes), welfare: sorted(lists.welfare) };
  }

  // Expert permit page: the studentLists() students split by whether the
  // 숙련 증서 shop sells them yet (상점 rows, 대상 상점 "숙련 증서").
  // pending: not in the shop yet, newest first appearance first.
  // added: newest shop addition first, keeping the sheet order of names
  // within the same date. Each entry: { name, kind, first, shop }.
  var EXPERT_SHOP = '숙련 증서';
  // Collaboration students never sold in the shop are left off the page.
  var EXPERT_EXCLUDED = { '미코토': true, '쇼쿠호': true, '사텐 루이코': true, '하츠네 미쿠': true };
  // Distributed students the sheet does not record as 배포캐릭터: 노노미 comes
  // from the first guide mission (KR launch, 2021-11-09).
  var EXPERT_EXTRA_WELFARE = [{ name: '노노미', first: '2021-11-09' }];
  function expertStudents(records, schema) {
    var lists = studentLists(records, schema);
    EXPERT_EXTRA_WELFARE.forEach(function (s) {
      if (!lists.welfare.some(function (w) { return w.name === s.name; })) lists.welfare.push(s);
    });
    var shopDay = {}, shopOrder = {}, seq = 0;
    var shop = schema['상점'];
    var targetCol = shop && column(shop, '대상 상점'), namesCol = shop && column(shop, '캐릭터 목록');
    if (targetCol && namesCol) {
      records.forEach(function (rec) {
        if (rec[COL.type] !== '상점' || rec[targetCol] !== EXPERT_SHOP) return;
        var day = normDay(rec[COL.start]);
        if (!day) return;
        (rec[namesCol] || '').split(',').forEach(function (n) {
          n = n.trim();
          if (!n || (shopDay[n] && shopDay[n] <= day)) return;
          shopDay[n] = day;
          shopOrder[n] = seq++;
        });
      });
    }
    var pending = [], added = [];
    ['fes', 'welfare', 'limited'].forEach(function (kind) {
      lists[kind].forEach(function (s) {
        if (EXPERT_EXCLUDED[s.name]) return;
        var entry = { name: s.name, kind: kind, first: s.first, shop: shopDay[s.name] || '' };
        (entry.shop ? added : pending).push(entry);
      });
    });
    pending.sort(function (a, b) {
      return a.first < b.first ? 1 : a.first > b.first ? -1 : (a.name < b.name ? -1 : 1);
    });
    added.sort(function (a, b) {
      return a.shop < b.shop ? 1 : a.shop > b.shop ? -1 : shopOrder[a.name] - shopOrder[b.name];
    });
    return { pending: pending, added: added };
  }

  var api = {
    parseCSV: parseCSV,
    csvToRecords: csvToRecords,
    buildSchema: buildSchema,
    sheetRowsToEvents: sheetRowsToEvents,
    eventHistory: eventHistory,
    studentLists: studentLists,
    expertStudents: expertStudents
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Adapter = api;
})(this);
