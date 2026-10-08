// Timeline renderer: ports the display rules of the design's renderVals()
// (project/Main.dc.html) and builds the DOM for a list of EVENTS.
(function (root) {
  'use strict';

  var TYPE_LABELS = { 'new': '신규이벤트', rerun: '복각이벤트', story: '메인스토리' };
  var DAY_MS = 86400000;
  var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

  function parseDay(s) {
    var p = s.split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function md(t) { var d = new Date(t); return pad(d.getUTCMonth() + 1) + '.' + pad(d.getUTCDate()); }
  function isPlaceholder(text) { return /^\[.*\]$/.test(String(text).trim()); }
  // Accepts a plain string or a sub-event line { label, text }.
  function textItem(v) {
    var text = typeof v === 'object' && v ? v.text : v;
    var label = typeof v === 'object' && v ? (v.label || '') : '';
    return { text: text, label: label, cls: isPlaceholder(text) ? 'ph' : '' };
  }

  var PICKUP_KIND = { 'new': '신규', rerun: '복각' };
  var PICKUP_TIER = { normal: '통상', limited: '한정', fes: '페스' };
  function pickupItem(p) {
    var item = textItem(p.name);
    item.kind = PICKUP_KIND[p.kind] ? p.kind : 'new';
    item.tier = PICKUP_TIER[p.tier] ? p.tier : 'normal';
    item.label = PICKUP_TIER[item.tier];
    item.isNew = item.kind === 'new';
    return item;
  }

  var BATTLE_LABELS = { total: '총력전', grand: '대결전', tactical: '종합전술시험' };
  var ARMORS = {
    light: { short: '경', full: '경장갑' },
    heavy: { short: '중', full: '중장갑' },
    special: { short: '특', full: '특수장갑' },
    elastic: { short: '탄', full: '탄력장갑' }
  };
  var ARMOR_ORDER = ['light', 'heavy', 'special', 'elastic'];
  function battleItem(b) {
    var item = textItem(b.boss);
    item.label = BATTLE_LABELS[b.type] || b.type;
    item.armorGroups = armorGroups(b.armor);
    return item;
  }
  // armor is either a flat list (one group) or a list of groups,
  // e.g. [['light', 'heavy'], ['special']] renders as 경중 / 특.
  function armorGroups(armor) {
    var raw = armor || [];
    var groups = raw.length && Array.isArray(raw[0]) ? raw : [raw];
    var out = groups.map(function (g, gi) {
      return {
        sep: gi > 0,
        armors: ARMOR_ORDER.filter(function (k) { return g.indexOf(k) >= 0; })
          .map(function (k) { return { key: k, short: ARMORS[k].short, full: ARMORS[k].full }; })
      };
    }).filter(function (g) { return g.armors.length > 0; });
    if (out.length) out[0].sep = false;
    return out;
  }

  // Pickups keep the sheet's row order. When every pickup in a group is fes,
  // the group head becomes "페스픽업" and the per-row tier text is dropped.
  // "통상" is never spelled out.
  function pickupGroup(list) {
    var items = list.map(pickupItem);
    var allFes = items.length > 0 && items.every(function (p) { return p.tier === 'fes'; });
    items.forEach(function (p) {
      p.pkCls = 'pk pk-' + p.tier + (p.isNew ? ' pk-isnew' : '');
      // New pickups get a bold name in their badge color (blue for normal).
      p.nameCls = p.isNew ? ' pk-new-name pk-new-' + p.tier : '';
      if (allFes || p.tier === 'normal') p.label = '';
    });
    return {
      pickups: items,
      hasPickups: items.length > 0,
      pkHead: allFes ? '페스픽업' : '픽업',
      pkHeadCls: allFes ? 'tag tag-fes' : 'tag tag-pk'
    };
  }

  // EVENTS -> rows of month separators and day groups.
  // Day groups starting before fromT are dropped after raid end lines are
  // attached, so cards keep the end lines of raids that started earlier.
  function buildRows(events, fromT) {
    var sorted = events.map(function (e, i) { return { e: e, i: i, t: parseDay(e.start) }; })
      .sort(function (a, b) { return a.t - b.t || a.i - b.i; });

    var days = [];
    var day = null;
    var raids = [];
    var cards = [];
    sorted.forEach(function (x) {
      var e = x.e;
      var d = new Date(x.t);
      if (!day || day.t !== x.t) {
        day = { isDay: true, t: x.t, start: e.start,
          label: md(x.t) + ' (' + WEEKDAYS[d.getUTCDay()] + ')', items: [], raids: [] };
        days.push(day);
      }

      if (e.type === 'raid') {
        var raid = {
          name: e.name,
          nameCls: isPlaceholder(e.name) ? 'ph' : '',
          armorGroups: armorGroups(e.armor),
          endT: parseDay(e.end),
          // Raids run n weeks minus a day; shown simply as "n주간".
          weeks: Math.round((Math.round((parseDay(e.end) - x.t) / DAY_MS) + 1) / 7)
        };
        day.raids.push(raid);
        raids.push(raid);
        return;
      }

      var item = pickupGroup(e.pickups || []);
      item.type = e.type;
      item.typeLabel = TYPE_LABELS[e.type] || e.type;
      item.name = e.name || '';
      item.nameCls = isPlaceholder(item.name) ? 'ph' : '';
      item.fullSubs = (e.fullSubs || []).map(textItem);
      item.battles = (e.battles || []).map(battleItem);
      item.weeks = [];
      item.raidEnds = [];

      if (e.type === 'story' || !e.end) {
        item.isStory = true;
        item.titles = item.name ? [{ typeLabel: item.typeLabel, name: item.name, nameCls: item.nameCls }] : [];
        day.items.push(item);
        return;
      }

      var len = Math.round((parseDay(e.end) - x.t) / DAY_MS) + 1;
      item.isCard = true;
      item.dateText = '~ ' + md(parseDay(e.end)) + ' · ' + len + '일간';
      item.weeks = (e.weeks || []).map(function (wk, w) {
        var subs = Array.isArray(wk) ? wk : (wk.subs || []);
        var pks = Array.isArray(wk) ? [] : (wk.pickups || []);
        var ws = x.t + w * 7 * DAY_MS;
        var we = Math.min(ws + 6 * DAY_MS, x.t + (len - 1) * DAY_MS);
        var week = pickupGroup(pks);
        week.label = (w + 1) + '주차 · ' + md(ws) + '–' + md(we);
        week.tint = w % 2 === 0 ? '--zone1' : '--zone2';
        week.subs = subs.map(textItem);
        week.battles = Array.isArray(wk) ? [] : (wk.battles || []).map(battleItem);
        week.isEmpty = !week.hasPickups && !week.subs.length && !week.battles.length;
        return week;
      });
      item.t = x.t;
      item.endT = parseDay(e.end);
      item.midStories = [];
      day.items.push(item);
      cards.push(item);
    });

    // All story blocks of a day share one frame (titles first, then text
    // lines), and that block always comes before the boxed cards of the day.
    days.forEach(function (dy) {
      var stories = dy.items.filter(function (it) { return it.isStory; });
      var others = dy.items.filter(function (it) { return !it.isStory; });
      if (stories.length > 1) {
        var merged = stories[0];
        stories.slice(1).forEach(function (s) {
          merged.titles = merged.titles.concat(s.titles);
          merged.fullSubs = merged.fullSubs.concat(s.fullSubs);
        });
        stories = [merged];
      }
      dy.items = stories.concat(others);
    });

    // A day holding only open-ended story blocks that starts inside a card's
    // period (after its first day) is drawn behind that card instead: the
    // frame starts at the week it begins in and its text follows the card.
    days = days.filter(function (dy) {
      if (dy.raids.length || dy.items.some(function (it) { return !it.isStory; })) return true;
      var host = null;
      cards.forEach(function (c) {
        if (c.t < dy.t && dy.t <= c.endT && (!host || c.t >= host.t)) host = c;
      });
      if (!host) return true;
      host.midStories.push({
        label: dy.label + ' ~',
        week: Math.floor((dy.t - host.t) / (7 * DAY_MS)),
        // Share of the card period elapsed when the story starts.
        frac: (dy.t - host.t) / (host.endT - host.t + DAY_MS),
        items: dy.items
      });
      return false;
    });

    // Attach each raid's end line under the card that ends the same day;
    // fall back to the last card that ends before it.
    raids.forEach(function (r) {
      var target = null;
      cards.forEach(function (c) { if (c.endT === r.endT) target = c; });
      if (!target) cards.forEach(function (c) { if (c.endT <= r.endT) target = c; });
      if (target) target.raidEnds.push(r);
    });

    var rows = [];
    var lastMonth = null;
    days.forEach(function (dy) {
      if (fromT != null && dy.t < fromT) return;
      var d = new Date(dy.t);
      var monthKey = d.getUTCFullYear() * 12 + d.getUTCMonth();
      if (monthKey !== lastMonth) {
        rows.push({ isMonth: true, label: d.getUTCFullYear() + '년 ' + (d.getUTCMonth() + 1) + '월' });
        lastMonth = monthKey;
      }
      rows.push(dy);
    });
    return {
      rows: rows,
      hasEarlier: fromT != null && days.some(function (dy) { return dy.t < fromT; })
    };
  }

  // ---- DOM ----

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function armorsHtml(groups) {
    if (!groups.length) return '';
    return '<span class="armors">' + groups.map(function (g) {
      return (g.sep ? '<span class="armor-sep" aria-hidden="true">/</span>' : '') +
        '<span class="armor-group">' + g.armors.map(function (a) {
          return '<span class="armor armor-' + a.key + '" title="' + esc(a.full) + '" aria-label="' +
            esc(a.full) + '">' + esc(a.short) + '</span>';
        }).join('') + '</span>';
    }).join('') + '</span>';
  }

  function raidHtml(r, tag, phase, extraCls) {
    return '<' + tag + ' class="m-card raid raid-' + phase + (extraCls ? ' ' + extraCls : '') + '">' +
      '<span class="tag tag-raid">제약해제결전</span>' +
      '<span class="raid-name ' + r.nameCls + '">' + esc(r.name) + '</span>' +
      armorsHtml(r.armorGroups) +
      '<span class="raid-phase">' + (phase === 'start' ? '시작 (' + r.weeks + '주간)' : '종료') + '</span>' +
      '</' + tag + '>';
  }

  function pickupsHtml(g) {
    if (!g.hasPickups) return '';
    return '<div class="pickups"><span class="' + g.pkHeadCls + '">' + esc(g.pkHead) + '</span>' +
      '<div class="pickup-list">' + g.pickups.map(function (p) {
        return '<div class="row-wrap"><span class="' + p.pkCls + '">' +
          (p.isNew ? '<span class="pk-badge">NEW</span>' : '') + esc(p.label) + '</span>' +
          '<span class="pickup-name ' + p.cls + p.nameCls + '">' + esc(p.text) + '</span></div>';
      }).join('') + '</div></div>';
  }

  function battlesHtml(list) {
    return list.map(function (b) {
      return '<div class="row-wrap"><span class="tag">' + esc(b.label) + '</span>' +
        '<span class="battle-name ' + b.cls + '">' + esc(b.text) + '</span>' +
        armorsHtml(b.armorGroups) + '</div>';
    }).join('');
  }

  function subsHtml(list) {
    return list.map(function (s) {
      return '<p class="sub">' + (s.label ? '<span class="sub-label">' + esc(s.label) + '</span>' : '') +
        '<span class="' + s.cls + '">' + esc(s.text) + '</span></p>';
    }).join('');
  }

  function cardHtml(item) {
    var weeks = item.weeks.map(function (w, i) {
      if (w.isEmpty) return '';
      return '<div class="week m-week" data-week="' + i + '" style="background: var(' + w.tint + ')">' +
        '<p class="week-label">' + esc(w.label) + '</p>' +
        pickupsHtml(w) + battlesHtml(w.battles) + subsHtml(w.subs) + '</div>';
    }).join('');
    var tag = item.midStories.length ? 'div' : 'li';
    var card = '<' + tag + ' class="card card-' + esc(item.type) + ' m-card">' +
      '<div class="card-head m-head">' +
      '<p class="card-date">' + esc(item.dateText) + '</p>' +
      // Gap cards (pickups/battles outside any event) have no tag or title row.
      (item.type === 'gap' ? '' :
        '<div class="title-row"><span class="tag tag-' + esc(item.type) + '">' + esc(item.typeLabel) + '</span>' +
        (item.name ? '<span class="title ' + item.nameCls + '">' + esc(item.name) + '</span>' : '') + '</div>') +
      pickupsHtml(item) + battlesHtml(item.battles) + subsHtml(item.fullSubs) +
      '</div>' + weeks + '</' + tag + '>';
    if (!item.midStories.length) {
      return card + item.raidEnds.map(function (r) { return raidHtml(r, 'li', 'end'); }).join('');
    }
    // Story blocks starting mid-card: their frame runs behind the card (placed
    // by layout()), their text follows it, and raid end lines come last.
    return '<li class="span-story" data-week="' + item.midStories[0].week +
      '" data-frac="' + item.midStories[0].frac.toFixed(4) + '">' +
      '<span class="span-frame" aria-hidden="true"></span>' + card +
      '<div class="story-tail">' + item.midStories.map(function (ms) {
        return '<p class="story-tail-date">' + esc(ms.label) + '</p>' +
          ms.items.map(storyBody).join('');
      }).join('') + '</div>' +
      item.raidEnds.map(function (r) { return raidHtml(r, 'p', 'end', 'raid-detached'); }).join('') +
      '</li>';
  }

  // A story block lists its main story titles (if any), then text lines.
  function storyBody(item) {
    return item.titles.map(function (t) {
      return '<div class="title-row">' +
        '<span class="tag tag-story">' + esc(t.typeLabel) + '</span>' +
        '<span class="title ' + t.nameCls + '">' + esc(t.name) + '</span></div>';
    }).join('') + subsHtml(item.fullSubs);
  }

  function storyHtml(item) {
    return '<li class="story">' + storyBody(item) + '</li>';
  }

  // Positions that depend on rendered sizes: where each mid-card story frame
  // starts and ends, how far detached raid end lines reach up to their card,
  // and how far a story block's line runs down to the card below it.
  var STORY_FADE = 28;
  var SPAN_FADE = 16; // must match the fade length of .span-frame::after
  function layout(root) {
    Array.prototype.forEach.call(root.querySelectorAll('.story'), function (story) {
      var next = story.nextElementSibling;
      while (next && !next.classList.contains('card') && !next.classList.contains('span-story')) {
        next = next.nextElementSibling;
      }
      if (!next) { story.style.removeProperty('--story-reach'); return; }
      var card = next.classList.contains('card') ? next : next.querySelector('.card');
      var gap = card.getBoundingClientRect().top - story.getBoundingClientRect().bottom;
      // The line fades out starting where the card begins.
      story.style.setProperty('--story-reach', (gap + STORY_FADE) + 'px');
    });
    var spans = root.querySelectorAll('.span-story');
    Array.prototype.forEach.call(spans, function (span) {
      var card = span.querySelector('.card');
      var week = card.querySelector('[data-week="' + span.getAttribute('data-week') + '"]');
      var spanTop = span.getBoundingClientRect().top;
      var top;
      if (week) {
        top = week.getBoundingClientRect().top - spanTop;
      } else {
        // No week zones: branch off at the point of the card matching the
        // start date's share of the card period (e.g. the middle for week 2 of 2).
        var rect = card.getBoundingClientRect();
        top = rect.top - spanTop + rect.height * parseFloat(span.getAttribute('data-frac') || '0');
      }
      span.style.setProperty('--frame-top', top + 'px');
      // The frame's line starts fading where its text ends and is gone
      // within about one line.
      var tail = span.querySelector('.story-tail');
      span.style.setProperty('--frame-bottom',
        (span.getBoundingClientRect().bottom - tail.getBoundingClientRect().bottom - SPAN_FADE) + 'px');
      var cardBottom = card.getBoundingClientRect().bottom;
      Array.prototype.forEach.call(span.querySelectorAll('.raid-detached'), function (r) {
        r.style.setProperty('--reach', (r.getBoundingClientRect().top - cardBottom) + 'px');
      });
    });
  }

  function rowsHtml(rows) {
    return rows.map(function (row) {
      if (row.isMonth) {
        return '<li class="month"><span class="month-label">' + esc(row.label) + '</span>' +
          '<span class="month-line" aria-hidden="true"></span></li>';
      }
      return '<li class="day"><h2 class="day-head"><span class="day-dot" aria-hidden="true"></span>' +
        '<time datetime="' + esc(row.start) + '">' + esc(row.label) + '</time></h2>' +
        // Order within a day: story blocks, raid start lines, then cards.
        '<ul class="day-items">' +
        row.items.filter(function (it) { return it.isStory; }).map(storyHtml).join('') +
        row.raids.map(function (r) { return raidHtml(r, 'li', 'start'); }).join('') +
        row.items.filter(function (it) { return !it.isStory; }).map(cardHtml).join('') +
        '</ul></li>';
    }).join('');
  }

  var api = { buildRows: buildRows, rowsHtml: rowsHtml, layout: layout, parseDay: parseDay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Timeline = api;
})(this);
