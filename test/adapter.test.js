// Run with: node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Adapter = require('../js/adapter.js');
const Timeline = require('../js/render.js');

const SCHEMA_CSV = [
  '종류,속성1,속성2,속성3,속성4,속성5',
  '메인스토리,제목,,,,',
  '미니스토리,제목,,,,',
  '이벤트,제목,신규/복각,배포캐릭터,,',
  '픽업,캐릭터1,캐릭터2,신규/복각,통상/한정/페스,',
  '제약해제결전,보스,지형,방어타입,,',
  '총력전,보스,지형,방어타입,,',
  '종합전술시험,사격/돌파/방어/호위,,,,',
  '대결전,보스,지형,상위방어타입,하위방어타입,',
  '패키지판매,패키지명,,,,',
  '캠페인,2배/3배,항목1,항목2,,',
  '애용품,캐릭터1,캐릭터2,캐릭터3,캐릭터4,캐릭터5'
].join('\n');

const HEADER = '정렬 키,일정차이,일섭시작일자,일섭종료일자,일섭개최일수,한섭시작일자,한섭종료일자,한섭개최일수,종류,속성1,속성2,속성3,속성4,속성5';
// Fixture lines are written as "start,end,days,,,,type,..."; the dates are
// placed in the Korean server columns, which the adapter reads.
function scheduleCsv(lines) {
  return [HEADER].concat(lines.map((l) => ',,' + l.replace(/^([^,]*),([^,]*),([^,]*),,,,/, ',,,$1,$2,$3,'))).join('\n');
}

const EXAMPLE = scheduleCsv([
  '2026-08-12,2026-08-26,14,,,,이벤트,판데믹 해저드 ~기적의 한 장~,복각,,,',
  '2026-08-12,2026-08-26,14,,,,픽업,세나(사복),,복각,통상,',
  '2026-08-12,2026-08-26,14,,,,픽업,니야,,복각,통상,',
  '2026-08-12,2026-08-19,7,,,,종합전술시험,호위,,,,',
  '2026-08-15,2026-08-17,2,,,,캠페인,2배,경험치,,,',
  '2026-08-19,2026-08-26,7,,,,대결전,비나,야외전,"경장갑, 중장갑",탄력장갑,',
  '2026-08-19,,,,,,미니스토리,이부키 가출 사건,,,,',
  '2026-08-19,,,,,,메인스토리,2부 Vol.1 「불꽃과 그림자」편 2장 「불꽃이 되는 우리」,,,,',
  '2026-07-30,2026-08-26,27,,,,제약해제결전,세트,야외전,경장갑,,',
  '2026-08-12,2026-09-23,42,,,,패키지판매,AP 패키지(7일),,,,'
]);

function convert(csv, schemaCsv = SCHEMA_CSV, warnings = []) {
  const schema = Adapter.buildSchema(Adapter.csvToRecords(schemaCsv));
  return Adapter.sheetRowsToEvents(Adapter.csvToRecords(csv), schema, { warn: (m) => warnings.push(m) });
}

test('parseCSV handles quoted commas and a missing trailing newline', () => {
  assert.deepEqual(Adapter.parseCSV('a,"b, c",d\r\n1,"say ""hi""",'), [
    ['a', 'b, c', 'd'],
    ['1', 'say "hi"', '']
  ]);
});

test('converts the example rows from the binding prompt', () => {
  assert.deepEqual(convert(EXAMPLE), [
    { type: 'rerun', start: '2026-08-12', end: '2026-08-25', name: '판데믹 해저드 ~기적의 한 장~',
      pickups: [
        { name: '세나(사복)', kind: 'rerun', tier: 'normal' },
        { name: '니야', kind: 'rerun', tier: 'normal' }
      ],
      weeks: [
        { battles: [{ type: 'tactical', boss: '호위', armor: [] }],
          subs: [{ label: '2배', text: '경험치 (08.15–08.16)' }] },
        { battles: [{ type: 'grand', boss: '비나', armor: [['light', 'heavy'], ['elastic']] }] }
      ] },
    { type: 'story', start: '2026-08-19', name: '2부 Vol.1 「불꽃과 그림자」편 2장 「불꽃이 되는 우리」',
      fullSubs: [{ label: '미니스토리', text: '「이부키 가출 사건」' }] },
    { type: 'raid', start: '2026-07-29', end: '2026-08-25', name: '세트', armor: ['light'] }
  ]);
});

test('attribute positions come from the schema tab, not from code', () => {
  // Same pickup with the schema columns reordered.
  const schema = SCHEMA_CSV.replace('픽업,캐릭터1,캐릭터2,신규/복각,통상/한정/페스,', '픽업,통상/한정/페스,신규/복각,캐릭터1,캐릭터2,');
  const csv = scheduleCsv([
    '2026-08-05,2026-08-12,7,,,,이벤트,테스트,신규,,,',
    '2026-08-05,2026-08-12,7,,,,픽업,페스,신규,이로하(수영복),이부키(수영복),'
  ]);
  assert.deepEqual(convert(csv, schema)[0].pickups, [
    { name: '이로하(수영복), 이부키(수영복)', kind: 'new', tier: 'fes' }
  ]);
});

test('rows of types missing from the schema are skipped with a warning', () => {
  const warnings = [];
  const csv = scheduleCsv(['2026-08-05,,,,,,업데이트,새 기능,,,,']);
  assert.deepEqual(convert(csv, SCHEMA_CSV, warnings), []);
  assert.equal(warnings.length, 1);
});

test('pickups outside any event become a gap card; orphan subs are dropped', () => {
  const csv = scheduleCsv([
    '2026-07-22,2026-07-29,7,,,,픽업,마코토,아코(드레스),복각,한정,',
    '2026-07-22,2026-07-29,7,,,,픽업,사츠키,,복각,통상,',
    '2026-07-22,2026-07-29,7,,,,캠페인,2배,임무(Hard),,,',
    '2026-10-07,2026-10-14,7,,,,캠페인,2배,스케줄,,,'
  ]);
  assert.deepEqual(convert(csv), [
    { type: 'gap', start: '2026-07-22', end: '2026-07-28', name: '',
      pickups: [
        { name: '마코토, 아코(드레스)', kind: 'rerun', tier: 'limited' },
        { name: '사츠키', kind: 'rerun', tier: 'normal' }
      ],
      fullSubs: [{ label: '2배', text: '임무(Hard)' }] }
  ]);
});

test('raid end line attaches to the card ending the same day; empty weeks are flagged', () => {
  const events = convert(EXAMPLE);
  const view = Timeline.buildRows(events, null);
  const card = view.rows.find((r) => r.isDay && r.start === '2026-08-12').items[0];
  assert.equal(card.raidEnds.length, 1);
  assert.equal(card.raidEnds[0].name, '세트');
  assert.equal(card.dateText, '~ 08.25 · 14일간');
  assert.deepEqual(card.weeks.map((w) => w.label), ['1주차 · 08.12–08.18', '2주차 · 08.19–08.25']);
  assert.ok(card.weeks.every((w) => !w.isEmpty));
});

test('buildRows hides days before fromT and reports earlier data', () => {
  const events = convert(EXAMPLE);
  const view = Timeline.buildRows(events, Timeline.parseDay('2026-08-12'));
  assert.equal(view.hasEarlier, true);
  assert.deepEqual(view.rows.filter((r) => r.isMonth).map((r) => r.label), ['2026년 8월']);
  assert.equal(view.rows.filter((r) => r.isDay)[0].start, '2026-08-12');
  assert.equal(Timeline.buildRows(events, Timeline.parseDay('2026-07-01')).hasEarlier, false);
});

test('open-ended rows without a main story form a text-only story block above cards', () => {
  const schema = SCHEMA_CSV + '\n이벤트(상설),이벤트명,,,,';
  const csv = scheduleCsv([
    '2026-07-22,2026-07-29,7,,,,픽업,사츠키,,복각,통상,',
    '2026-07-22,,,,,,이벤트(상설),햇살 드는 그녀들의 소야곡,,,,',
    '2026-07-22,,,,,,애용품,카린,에리,시미코,,'
  ]);
  const events = convert(csv, schema);
  assert.deepEqual(events.find((e) => e.type === 'story'), {
    type: 'story', start: '2026-07-22', name: '',
    fullSubs: [{ label: '상설 이벤트', text: '햇살 드는 그녀들의 소야곡' }, { label: '애용품', text: '카린 · 에리 · 시미코' }]
  });
  const day = Timeline.buildRows(events, null).rows.find((r) => r.isDay);
  assert.deepEqual(day.items.map((it) => (it.isStory ? 'story' : it.type)), ['story', 'gap']);
  const html = Timeline.rowsHtml([day]);
  assert.doesNotMatch(html, /tag-story/);
  assert.ok(html.indexOf('class="story"') < html.indexOf('card-gap'));
});

test('gap cards render without a tag or title row', () => {
  const csv = scheduleCsv(['2026-07-22,2026-07-29,7,,,,픽업,사츠키,,복각,통상,']);
  const html = Timeline.rowsHtml(Timeline.buildRows(convert(csv), null).rows);
  assert.doesNotMatch(html, /기타 일정/);
  assert.match(html, /card-gap/);
});

test('story-only days inside a card period are drawn behind that card', () => {
  const view = Timeline.buildRows(convert(EXAMPLE), null);
  assert.equal(view.rows.some((r) => r.isDay && r.start === '2026-08-19'), false);
  const card = view.rows.find((r) => r.isDay && r.start === '2026-08-12').items[0];
  assert.equal(card.midStories.length, 1);
  assert.equal(card.midStories[0].label, '08.19 (수) ~');
  assert.equal(card.midStories[0].week, 1);
  assert.equal(card.midStories[0].items[0].name, '2부 Vol.1 「불꽃과 그림자」편 2장 「불꽃이 되는 우리」');
  const html = Timeline.rowsHtml(view.rows);
  assert.match(html, /<li class="span-story" data-week="1">/);
  // The raid ending with this card comes after the story text.
  assert.ok(html.indexOf('story-tail') < html.indexOf('raid-detached'));
});

test('a day lists story blocks, then raid start lines, then cards', () => {
  const csv = scheduleCsv([
    '2026-09-23,2026-10-07,14,,,,이벤트,테스트 이벤트,신규,,,',
    '2026-09-24,2026-10-28,34,,,,제약해제결전,티페레트,실내전,중장갑,,',
    '2026-09-23,,,,,,애용품,카린,에리,시미코,,'
  ]);
  const html = Timeline.rowsHtml(Timeline.buildRows(convert(csv), null).rows);
  const story = html.indexOf('class="story"');
  const raid = html.indexOf('raid-start');
  const card = html.indexOf('card-new');
  assert.ok(story < raid && raid < card);
});

test('raid start lines show the length in weeks', () => {
  // Sheet: 27 days (2026-07-30 to 2026-08-26) -> 4 weeks.
  const html = Timeline.rowsHtml(Timeline.buildRows(convert(EXAMPLE), null).rows);
  assert.match(html, /<span class="raid-phase">시작 \(4주간\)<\/span>/);
  const csv = scheduleCsv(['2026-09-24,2026-10-28,34,,,,제약해제결전,티페레트,실내전,중장갑,,']);
  assert.match(Timeline.rowsHtml(Timeline.buildRows(convert(csv), null).rows), /시작 \(5주간\)/);
});

test('story blocks of the same day share one frame', () => {
  const csv = scheduleCsv([
    '2026-04-21,,,,,,메인스토리,2부 프롤로그,,,,',
    '2026-04-21,,,,,,메인스토리,2부 Vol.0 「총학생회」편 1장 「살구꽃이 피는 어느 봄날에」,,,,',
    '2026-04-21,,,,,,미니스토리,테스트 미니,,,,'
  ]);
  const day = Timeline.buildRows(convert(csv), null).rows.find((r) => r.isDay);
  assert.equal(day.items.length, 1);
  assert.deepEqual(day.items[0].titles.map((t) => t.name),
    ['2부 프롤로그', '2부 Vol.0 「총학생회」편 1장 「살구꽃이 피는 어느 봄날에」']);
  const html = Timeline.rowsHtml([day]);
  assert.equal((html.match(/class="story"/g) || []).length, 1);
  assert.equal((html.match(/tag-story/g) || []).length, 2);
  assert.match(html, /<span class="sub-label">미니스토리<\/span><span class="">「테스트 미니」<\/span>/);
});

test('group story lines show the episode range', () => {
  const schema = SCHEMA_CSV + '\n그룹스토리,제목,화수,,,';
  const csv = scheduleCsv([
    '2021-07-29,,,,,,그룹스토리,선도부,2,,,',
    '2021-07-29,,,,,,그룹스토리,수행부,3-4,,,'
  ]);
  assert.deepEqual(convert(csv, schema)[0].fullSubs, [
    { label: '그룹스토리', text: '「선도부」 2화' },
    { label: '그룹스토리', text: '「수행부」 3-4화' }
  ]);
});

test('dates in display formats are normalized', () => {
  const csv = [HEADER, ',,2026. 6. 10. (수),2026. 6. 24. (수),14,2026. 9. 29. (화),2026. 10. 13. (화),14,이벤트,테스트,복각,,,'].join('\n');
  assert.deepEqual(convert(csv), [{ type: 'rerun', start: '2026-09-29', end: '2026-10-12', name: '테스트' }]);
});

test('permanent events (이벤트 + 상설) become story text lines', () => {
  const schema = SCHEMA_CSV.replace('이벤트,제목,신규/복각,배포캐릭터,,', '이벤트,제목,신규/복각/상설,배포캐릭터,,');
  const csv = scheduleCsv([
    '2026-07-22,2026-08-05,14,,,,이벤트,테스트 이벤트,신규,,,',
    '2026-07-22,,,,,,이벤트,빛으로 나아가는 그녀들의 소야곡,상설,,,'
  ]);
  const events = convert(csv, schema);
  assert.deepEqual(events.map((e) => e.type), ['new', 'story']);
  assert.deepEqual(events[1].fullSubs, [{ label: '상설 이벤트', text: '빛으로 나아가는 그녀들의 소야곡' }]);
});
