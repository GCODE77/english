#!/usr/bin/env node
/**
 * index.html 자기 검증 스크립트.  실행:  node tools/verify.js
 *
 * 이 앱은 빌드 도구가 없어서 브라우저를 열기 전까지 오류를 알 수 없다.
 * 그래서 index.html의 스크립트를 가짜 브라우저 환경에 올려 세션을 끝까지 돌려 본다.
 * 데이터를 고쳤으면 반드시 이걸 먼저 돌릴 것. 실패하면 종료 코드 1.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const TRACK_IDS = ['toddler', 'child', 'elem', 'mid', 'high', 'univ', 'work'];
const FILE = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(FILE, 'utf8');
const css = html.split('<style>')[1].split('</style>')[0];
const src = html.split('<script>')[1].split('</script>')[0];

const fail = [];
const note = m => console.log('  ' + m);

/* ---------- 가짜 브라우저 ---------- */
function makeBox() {
  const store = {};
  const el = () => ({ innerHTML: '', classList: { add(){}, remove(){}, toggle(){} },
                      style: {}, dataset: {}, textContent: '' });
  const box = {
    console, Math, Date, JSON, Object, Array, RegExp, String, Number, Set, Map,
    window: { scrollTo(){}, addEventListener(){} },
    navigator: {}, location: { protocol: 'https:' },
    clearTimeout(){}, setTimeout: (f, ms) => { if (ms <= 100 && f) f(); },
    document: {
      getElementById: id => id === 'toast'
        ? { classList: { add(){}, remove(){} }, set textContent(v) {} }
        : el(),
      querySelectorAll: () => []
    },
    localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    speechSynthesis: { speaking: false, pending: false, cancel(){}, resume(){},
                       getVoices: () => [{ lang: 'en-US' }], speak(u) { if (u.onstart) u.onstart(); } },
    SpeechSynthesisUtterance: function (t) { this.text = t; }
  };
  box.window.speechSynthesis = box.speechSynthesis;
  vm.createContext(box);
  vm.runInContext(
    src.replace(/^render\(\);$/m, '') +
    ';globalThis.A={WORDS,GRAMMAR,home,study,quiz,result,library,start,answer,next,' +
    'setPick,openLibrary,libTab,blankOut,build,buildG,explain,explainG,scoreFor,TRACK_COUNTS,LOADED,getP:()=>P,getS:()=>S};',
    box
  );
  for (const t of TRACK_IDS)
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'data', t + '.js'), 'utf8'), box);
  return box;
}

const box = makeBox();
const A = box.A;

/* ---------- 1. 단어 데이터 ---------- */
console.log('\n[1] 단어 데이터 ' + A.WORDS.length + '개');
{
  const ids = new Set();
  for (const w of A.WORDS) {
    if (ids.has(w.id)) fail.push(`단어 중복 id: ${w.id}`);
    ids.add(w.id);
    for (const k of ['term', 'meaningKo', 'pos', 'example', 'exampleKo', 'level', 'track'])
      if (!w[k]) fail.push(`${w.id}: ${k} 누락`);
    // IPA는 확인된 표기만 넣는다. 없으면 비워 두고(지어내지 않기), 있으면 형식만 검사한다
    if (w.ipa && !/^\/.+\/$/.test(w.ipa)) fail.push(`${w.id}: IPA 표기 오류 ${w.ipa}`);
    const re = new RegExp('\\b' + w.term + '\\b', 'i');
    if (!re.test(w.example)) fail.push(`${w.id}: 예문에 기본형 '${w.term}' 없음 → 빈칸 문제 불가`);
    const cz = A.blankOut(w);
    if (!cz.includes('______')) fail.push(`${w.id}: 빈칸 생성 실패`);
    if (re.test(cz)) fail.push(`${w.id}: 빈칸 문장에 정답 노출`);
    if ((w.confusions || []).length < 2) fail.push(`${w.id}: 헷갈리는 짝 2개 미만`);
  }
  for (const w of A.WORDS)
    for (const c of w.confusions || []) {
      if (!ids.has(c.id)) fail.push(`${w.id}: 없는 참조 '${c.id}'`);
      if (c.id === w.id) fail.push(`${w.id}: 자기 자신을 오답으로 지정`);
      const tgt = A.WORDS.find(x => x.id === c.id);
      if (tgt && tgt.track !== w.track) fail.push(`${w.id}→${c.id}: 다른 트랙 단어를 오답으로 지정`);
      if ((c.note || '').length < 20) fail.push(`${w.id}→${c.id}: 해설이 너무 짧음`);
      // 예문에 오답 후보가 들어 있으면 빈칸 문제에서 소거 힌트가 된다
      const other = A.WORDS.find(x => x.id === c.id);
      if (other && new RegExp('\\b' + other.term + '\\b', 'i').test(w.example))
        fail.push(`${w.id}: 예문에 오답 후보 '${other.term}' 노출 → 힌트 유출`);
    }
  const byTr = {};
  A.WORDS.forEach(w => byTr[w.track] = (byTr[w.track] || 0) + 1);
  note('트랙 분포 ' + JSON.stringify(byTr));
  for (const t of ['toddler','child','elem','mid','high','univ','work'])
    if ((byTr[t] || 0) < 12) fail.push(`트랙 ${t}: 단어가 12개 미만 (보기 구성 불가 위험)`);
}

/* ---------- 2. 문법 데이터 ---------- */
console.log('\n[2] 문법 데이터 ' + A.GRAMMAR.length + '문항');
{
  const ids = new Set();
  for (const g of A.GRAMMAR) {
    if (ids.has(g.id)) fail.push(`문법 중복 id: ${g.id}`);
    if (!g.track) fail.push(`${g.id}: track 누락`);
    ids.add(g.id);
    if (!g.sentence.includes('___')) fail.push(`${g.id}: 빈칸 없음`);
    if (g.options.length !== 4) fail.push(`${g.id}: 보기 ${g.options.length}개 (4개여야 함)`);
    if (new Set(g.options.map(o => o.toLowerCase())).size !== 4) fail.push(`${g.id}: 보기 중복`);
    if (!g.options.includes(g.answer)) fail.push(`${g.id}: 보기에 정답이 없음`);
    for (const o of g.options) {
      if (o === g.answer) continue;
      if (!g.notes[o]) fail.push(`${g.id}: 오답 '${o}' 해설 없음`);
      else if (g.notes[o].length < 20) fail.push(`${g.id}: 오답 '${o}' 해설이 너무 짧음`);
      if (/[,(]/.test(o)) fail.push(`${g.id}: 보기 '${o}' — 콤마·괄호는 버튼 라벨로 부적절`);
    }
    if (g.full.includes('___')) fail.push(`${g.id}: full 문장에 빈칸이 남음`);
    if (new RegExp('\\b' + g.answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
        .test(g.sentence.replace('___', '§')))
      fail.push(`${g.id}: 문제 문장에 정답이 이미 노출됨`);
    if (!g.ko) fail.push(`${g.id}: 한국어 해석 없음`);
    if ((g.tip || '').length < 12) fail.push(`${g.id}: 규칙 설명(tip) 부실`);
  }
  const byLv = {};
  A.GRAMMAR.forEach(g => byLv[g.track] = (byLv[g.track] || 0) + 1);
  note('트랙 분포 ' + JSON.stringify(byLv) +
       ' · 주제 ' + new Set(A.GRAMMAR.map(g => g.topic)).size + '종');
}

/* ---------- 3. 문제 생성 ---------- */
console.log('\n[3] 문제 생성 (단어 ' + A.WORDS.length + ' × 3형식)');
{
  for (const w of A.WORDS)
    for (const m of ['MEANING', 'RECALL', 'CLOZE']) {
      const q = A.build(w, m);
      if (q.opts.length !== 4) fail.push(`${w.id}/${m}: 보기 ${q.opts.length}개`);
      if (q.opts.filter(o => o.id === w.id).length !== 1) fail.push(`${w.id}/${m}: 정답 개수 오류`);
      if (new Set(q.opts.map(o => o.id)).size !== 4) fail.push(`${w.id}/${m}: 보기 중복`);
    }
  for (const w of A.WORDS) {
    const other = A.WORDS.find(x => x.id !== w.id);
    if (!A.explain(w, other.id)) fail.push(`${w.id}: 오답 해설이 비어 있음`);
  }
  if (A.scoreFor(1) !== 10 || A.scoreFor(6) !== 20 || A.scoreFor(99) !== 20)
    fail.push('연속 정답 보너스 계산 오류');
}

/* ---------- 4. 세션 완주 + 화면 렌더 ---------- */
console.log('\n[4] 세션 시뮬레이션');
{
  const chk = (tag, s) => {
    const open = (s.match(/onclick=/g) || []).length;
    const ok = (s.match(/onclick="[^"]*"/g) || []).length;
    if (open !== ok) fail.push(`${tag}: onclick 속성 파손 ${open}개 중 ${ok}개만 정상`);
    if (/undefined|\[object |NaN/.test(s)) fail.push(`${tag}: 템플릿 렌더 오류`);
  };
  const runs = [['work',0,'mix'],['work',1,'word'],['work',2,'grammar'],['work',3,'mix']];
  for (const t of ['toddler','child','elem','mid','high','univ']) runs.push([t,0,'mix'],[t,0,'word'],[t,0,'grammar']);
  for (const [track, lv, cat] of runs) {
    A.setPick('track', track); A.setPick('level', lv); A.setPick('cat', cat);
    chk('home', A.home());
    A.start();
    const S = A.getS();
    if (S.screen === 'home') { fail.push(`${track}/레벨${lv}/${cat}: 세션 생성 실패`); continue; }
    let guard = 0;
    while (S.screen === 'study' && guard++ < 60) { chk('study', A.study()); S.si++; if (S.si >= S.deck.length) S.screen = 'quiz'; }
    guard = 0; let nw = 0, ng = 0;
    while (S.screen === 'quiz' && guard++ < 90) {
      const q = S.qs[S.i];
      q.kind === 'g' ? ng++ : nw++;
      chk('quiz', A.quiz());
      const correct = q.kind === 'g' ? q.g.answer : q.w.id;
      // 절반은 일부러 틀려서 해설·재출제·통계를 함께 검증
      A.answer(S.i % 2 === 0 ? q.opts.find(o => o.id !== correct).id : correct);
      if (S.i % 2 === 0 && !S.fb.why) fail.push('오답인데 해설이 비어 있음');
      chk('feedback', A.quiz());
      A.next();
    }
    chk('result', A.result());
    // 출제된 문제가 전부 선택한 트랙 것인지
    if (S.qs.some(q => (q.kind === 'g' ? q.g : q.w).track !== track)) fail.push(`${track}: 다른 트랙 문제가 섞임`);
    if (S.qs.some(q => q.opts.some(o => (q.kind === 'g' ? false : A.WORDS.find(x => x.id === o.id).track !== track)))) fail.push(`${track}: 보기에 다른 트랙 단어가 섞임`);
    note(`${track}/레벨${lv}/${cat}: 단어 ${nw} · 문법 ${ng} · 점수 ${S.score} · 정답 ${S.right}/${S.qs.length}`);
  }
}

/* ---------- 5. 통계 · 학습 노트 ---------- */
console.log('\n[5] 통계와 학습 노트');
{
  const items = Object.values(A.getP().items);
  if (!items.length) fail.push('진도 기록이 저장되지 않음');
  if (items.some(v => !v.n)) fail.push('시도 횟수(n)가 기록되지 않은 항목 있음');
  if (!items.some(v => v.w > 0)) fail.push('오답 횟수(w)가 기록되지 않음');
  if (!items.some(v => v.lw)) fail.push('마지막 오답 선택(lw)이 기록되지 않음');
  note(`항목 ${items.length}개 · 오답 경험 ${items.filter(v => v.w > 0).length}개`);

  A.openLibrary();
  const weak = A.library();
  if (weak.includes('아직 틀린 문제가 없습니다')) fail.push('약점 노트가 비어 있음 (통계 연결 실패)');
  A.setPick('track', 'work');
  A.libTab('words');
  const wn = (A.library().match(/class="item"/g) || []).length;
  const ewn = A.WORDS.filter(w => w.track === 'work').length;
  if (wn !== ewn) fail.push(`단어 목록 ${wn}행 (기대 ${ewn})`);
  A.libTab('grammar');
  const gn = (A.library().match(/class="item"/g) || []).length;
  const egn = A.GRAMMAR.filter(g => g.track === 'work').length;
  if (gn !== egn) fail.push(`문법 목록 ${gn}행 (기대 ${egn})`);
  A.setPick('track', 'toddler'); A.libTab('words');
  const tn = (A.library().match(/class="item"/g) || []).length;
  if (tn !== A.WORDS.filter(w => w.track === 'toddler').length) fail.push('유아 트랙 학습 노트 행 수 불일치');
  note(`단어 탭 ${wn}행 · 문법 탭 ${gn}행`);
}

/* ---------- 6. CSS / DOM 정합성 ---------- */
console.log('\n[6] CSS · DOM 정합성');
{
  const defined = new Set([...css.matchAll(/--([a-z-]+)\s*:/g)].map(m => m[1]));
  [...new Set([...css.matchAll(/var\(--([a-z-]+)\)/g)].map(m => m[1]))]
    .filter(v => !defined.has(v))
    .forEach(v => fail.push('정의되지 않은 CSS 변수: --' + v));

  const ob = (css.match(/{/g) || []).length, cb = (css.match(/}/g) || []).length;
  if (ob !== cb) fail.push(`CSS 중괄호 불균형 { ${ob} } ${cb}`);
  if (!css.includes('prefers-color-scheme: dark')) fail.push('다크 모드 정의가 사라짐');
  [...css.matchAll(/background:\s*(#[0-9A-Fa-f]{3,6})/g)]
    .forEach(m => fail.push(`하드코딩된 배경색 ${m[1]} — 다크 모드에서 깨진다. CSS 변수를 쓸 것`));

  [...new Set([...src.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]))]
    .forEach(id => { if (!html.includes('id="' + id + '"')) fail.push('존재하지 않는 id 참조: ' + id); });

  // PWA 필수 파일
  for (const f of ['manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png'])
    if (!fs.existsSync(path.join(__dirname, '..', f))) fail.push('PWA 파일 누락: ' + f);
  const mf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.webmanifest'), 'utf8'));
  mf.icons.forEach(i => {
    if (!fs.existsSync(path.join(__dirname, '..', i.src.replace('./', ''))))
      fail.push('매니페스트가 가리키는 아이콘 없음: ' + i.src);
  });
  note('CSS 변수 ' + defined.size + '개 · PWA 파일 확인');

  // 데이터 분리 정합성: 개수 표(TRACK_COUNTS) 동기화, 서비스워커 캐시 목록, 트랙 로드 상태
  for (const t of TRACK_IDS) {
    const w = A.WORDS.filter(x => x.track === t).length, g = A.GRAMMAR.filter(x => x.track === t).length;
    const c = A.TRACK_COUNTS[t] || {};
    if (c.w !== w || c.g !== g)
      fail.push(`TRACK_COUNTS[${t}] = ${c.w}/${c.g} 이지만 실제는 ${w}/${g} → node tools/sync-counts.js 실행`);
    if (!A.LOADED.has(t)) fail.push('트랙이 로드되지 않음: ' + t);
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    if (!sw.includes("'./data/" + t + ".js'")) fail.push('sw.js ASSETS 에 data/' + t + '.js 없음 → 오프라인에서 이 트랙이 안 열림');
  }
  if (html.includes('const WORDS = [\n  {')) fail.push('index.html 안에 데이터가 다시 들어옴 → data/*.js 에 둘 것');
  note('트랙 데이터 ' + TRACK_IDS.length + '개 · TRACK_COUNTS 동기화 확인');
}

/* ---------- 결과 ---------- */
console.log('\n' + '='.repeat(52));
if (fail.length) {
  console.log(`실패 ${fail.length}건\n`);
  fail.forEach(f => console.log('  ✕ ' + f));
  process.exit(1);
}
console.log('전체 통과');
