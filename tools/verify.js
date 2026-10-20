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
    'setPick,openLibrary,libTab,blankOut,build,buildG,explain,explainG,scoreFor,TRACK_COUNTS,LOADED,SND,TTS,render,goHome,closeSession,saveSession,readSession,resumeSession,clearSession,toggleSound,SET,AUTO,flash,flashdone,startFlash,flashStep,flashDeck,flashQuiz,exitFlash,flashTap,studyNext,UI,setTheme,toggleHC,themeSheetHtml,toggleSetSheet,hcBtn,autoFsWanted,setAutoFs,iosHintHtml,fsBannerWanted,fsBannerHtml,getP:()=>P,getS:()=>S};',
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

/* ---------- 7. 자동 발음 · 이어서 하기 ---------- */
console.log('\n[7] 자동 발음 · 이어서 하기');
{
  box.confirm = () => true;
  let spoke = 0;
  const origSay = A.TTS.say; A.TTS.say = () => { spoke++; };
  if (A.SND.on) fail.push('자동 발음 기본값이 꺼짐이 아님');

  A.clearSession();
  A.setPick('track', 'elem'); A.setPick('cat', 'mix'); A.setPick('level', 0);
  const base = A.getP().total;
  A.start();
  let S = A.getS();
  if (S.screen === 'study') { S.screen = 'quiz'; A.render(); }
  S = A.getS();
  const q0 = S.qs[S.i];
  A.answer(q0.kind === 'g' ? q0.g.answer : q0.w.id);          // 정답 1개
  if (spoke) fail.push('자동 발음이 꺼져 있는데 정답 확인 때 재생됨');
  const snap = (JSON.parse(box.localStorage.getItem('bvq_sessions') || '{}').elem || null);
  if (!snap) fail.push('진행 중인 세션이 저장되지 않음');
  else if (snap.score <= 0 || !snap.fb) fail.push('저장본에 점수·피드백 상태가 없음');

  A.goHome();                                                  // 🏠 홈 = 일시정지
  if (A.getS().screen !== 'home') fail.push('goHome 이 홈으로 가지 않음');
  if (!A.readSession()) fail.push('홈으로 나간 뒤 저장본이 사라짐');
  if (!A.home().includes('이어서 하기')) fail.push('홈에 이어서 하기 버튼이 없음');
  // 세션은 트랙별로 따로 저장된다: 다른 탭에는 이어서 하기가 보이면 안 되고, 돌아오면 다시 보여야 한다
  A.setPick('track', 'toddler');
  if (A.readSession()) fail.push('다른 트랙(유아)에 초등의 저장본이 보임');
  if (A.home().includes('이어서 하기')) fail.push('유아 탭 홈에 초등의 이어서 하기가 보임');
  A.setPick('track', 'elem');
  if (!A.readSession()) fail.push('초등 탭으로 돌아왔는데 저장본이 사라짐');
  if (!A.readSession('elem') || A.readSession('toddler')) fail.push('readSession(트랙) 인자 동작 오류');
  const pausedScore = snap ? snap.score : 0;

  A.resumeSession();
  S = A.getS();
  if (S.screen !== 'quiz' || S.qs.length !== snap.qs.length || S.i !== snap.i || S.score !== snap.score || S.right !== snap.right)
    fail.push('이어서 하기가 저장 시점의 상태를 복원하지 못함');
  if (!S.fb || S.fb.chosen !== snap.fb.chosen) fail.push('이어서 하기가 피드백 상태를 복원하지 못함');

  // 끝까지 진행 → 결과 화면에서 저장본 삭제, 점수는 중복 없이 한 번만 합산
  let guard = 0;
  while (A.getS().screen === 'quiz' && guard++ < 60) {
    const st = A.getS();
    if (!st.fb) { const q = st.qs[st.i]; A.answer(q.kind === 'g' ? q.g.answer : q.w.id); }
    A.next();
  }
  if (A.getS().screen !== 'result') fail.push('이어서 한 세션이 결과 화면에 도달하지 못함');
  if (A.readSession()) fail.push('세션이 끝났는데 저장본이 남아 있음');
  if (A.getP().total !== base + A.getS().score)
    fail.push('점수 합산 오류: 기대 ' + (base + A.getS().score) + ' 실제 ' + A.getP().total + ' (홈 → 이어서 하기에서 중복 합산?)');
  note('이어서 하기 복원 · 점수 중복 없음 · 완료 시 저장본 삭제 확인 (일시정지 점수 ' + pausedScore + ')');

  // 자동 발음을 켜면 재생된다
  A.toggleSound();
  if (!A.SND.on) fail.push('toggleSound 가 켜지지 않음');
  A.setPick('cat', 'word'); A.start();
  S = A.getS();
  if (S.screen === 'study') { S.screen = 'quiz'; A.render(); }
  S = A.getS();
  spoke = 0;
  const q1 = S.qs[S.i]; A.answer(q1.kind === 'g' ? q1.g.answer : q1.w.id);
  if (!spoke) fail.push('자동 발음이 켜져 있는데 재생되지 않음');
  A.toggleSound();
  A.TTS.say = origSay;
  A.clearSession();
}

/* ---------- 8. 발음기호 · 자동 넘김 · 깜빡이 암기 ---------- */
console.log('\n[8] 발음기호 · 자동 넘김 · 깜빡이 암기');
{
  // 발음기호 커버리지 (CMUdict 로 채움, 사전에 없는 일부 단어만 비어 있음)
  const withIpa = A.WORDS.filter(w => w.ipa).length;
  const pct = withIpa / A.WORDS.length * 100;
  if (pct < 97) fail.push('발음기호 커버리지 ' + pct.toFixed(1) + '% (97% 미만) → node tools/gen-ipa.js 로 채울 것');
  note('발음기호 ' + withIpa + '/' + A.WORDS.length + ' (' + pct.toFixed(1) + '%)');

  // 빈칸(CLOZE) 문제는 정답을 확인하기 전에 발음기호를 보여 주면 안 된다 (소리값이 힌트)
  A.setPick('track', 'mid'); A.setPick('cat', 'word'); A.start();
  {
    const w = A.WORDS.find(x => x.track === 'mid' && x.ipa);
    const q = A.build(w, 'CLOZE');
    const st = A.getS(); st.qs = [q]; st.i = 0; st.fb = null; st.screen = 'quiz';
    if (A.quiz().includes(w.ipa)) fail.push('빈칸 문제가 정답 확인 전에 발음기호를 보여 줌 (힌트 유출)');
    st.fb = {ok: true, chosen: w.id, gain: 10, why: ''};
    if (!A.quiz().includes(w.ipa)) fail.push('빈칸 문제가 정답 확인 뒤에도 발음기호를 보여 주지 않음');
    st.fb = null;
  }

  // 학습 카드 자동 넘김: 켜져 있으면 타이머가 걸리고, 마지막 카드 다음은 퀴즈
  A.setPick('track', 'toddler'); A.setPick('cat', 'word');
  box.localStorage.removeItem && box.localStorage.removeItem('bvq_progress');
  A.SET.auto = true; A.SET.autoSec = 6;
  A.start();
  let S = A.getS();
  if (S.screen === 'study') {
    const html = A.study();
    if (typeof A.AUTO.fn !== 'function') fail.push('자동 넘김이 켜져 있는데 타이머가 걸리지 않음');
    if (!html.includes('animation-duration:6000ms')) fail.push('자동 넘김 진행 막대가 없음');
    const n = S.deck.length;
    for (let k = 0; k < n; k++) A.studyNext();
    if (A.getS().screen !== 'quiz') fail.push('자동 넘김이 마지막 카드 뒤에 퀴즈로 넘어가지 않음');
    A.SET.auto = false; S = A.getS(); S.screen = 'study'; S.si = 0;
    A.study();
    if (A.AUTO.fn) fail.push('자동 넘김이 꺼져 있는데 타이머가 걸림');
    A.SET.auto = true;
  } else fail.push('유아 트랙에서 학습 카드가 나오지 않음(신규 단어가 없음?)');

  // 깜빡이 암기
  A.setPick('track', 'elem'); A.SET.flashDeck = 'least'; A.SET.flashCount = 20; A.SET.flashLoop = true; A.SET.flashSpeed = 'normal';
  A.startFlash();
  S = A.getS();
  if (S.screen !== 'flash' || !S.fl || !S.fl.deck.length) fail.push('깜빡이 암기가 시작되지 않음');
  else {
    if (S.fl.deck.length > 20) fail.push('깜빡이 개수 설정을 넘김');
    if (S.fl.deck.some(id => !A.WORDS.find(w => w.id === id && w.track === 'elem'))) fail.push('깜빡이에 다른 트랙 단어가 섞임');
    const w0 = A.WORDS.find(x => x.id === S.fl.deck[0]);
    let html = A.flash();
    if (!html.includes(w0.term)) fail.push('깜빡이 1단계에 영어 단어가 없음');
    if (w0.ipa && !html.includes(w0.ipa)) fail.push('깜빡이 1단계에 발음기호가 없음');
    if (html.includes(w0.meaningKo)) fail.push('깜빡이 1단계에서 뜻이 미리 보임');
    if (typeof A.AUTO.fn !== 'function') fail.push('깜빡이 타이머가 걸리지 않음');
    if (/undefined|NaN|\[object /.test(html)) fail.push('깜빡이 화면 템플릿 오류');
    A.flashStep(0);                                           // 영어 → 뜻
    html = A.flash();
    if (A.getS().fl.phase !== 1 || !html.includes(w0.meaningKo) || !html.includes(w0.exampleKo)) fail.push('깜빡이 2단계에 뜻·예문이 나오지 않음');
    A.flashStep(0);                                           // 뜻 → 다음 단어
    if (A.getS().fl.i !== 1 || A.getS().fl.phase !== 0) fail.push('깜빡이가 다음 단어로 넘어가지 않음');
    A.flashStep(-1);
    if (A.getS().fl.i !== 0) fail.push('깜빡이 이전 단어 이동 오류');
    A.flashTap();
    if (!A.getS().fl.paused || A.AUTO.fn) fail.push('일시정지가 타이머를 멈추지 않음');
    A.flashTap();
    // 한 바퀴를 돌면 (반복 켜짐) 다음 바퀴
    const total = A.getS().fl.deck.length;
    for (let k = 0; k < total; k++) A.flashStep(1);
    if (A.getS().fl.round !== 2 || A.getS().fl.i !== 0) fail.push('끝나면 반복(바퀴 증가)이 동작하지 않음');
    // 반복을 끄면 완료 화면 → 방금 본 단어로 퀴즈
    A.SET.flashLoop = false;
    for (let k = 0; k < total; k++) A.flashStep(1);
    if (A.getS().screen !== 'flashdone') fail.push('반복을 껐는데 완료 화면이 나오지 않음');
    if (!A.flashdone().includes('방금 본 단어로 퀴즈')) fail.push('완료 화면에 퀴즈 버튼이 없음');
    A.flashQuiz();
    if (A.getS().screen !== 'quiz' || !A.getS().qs.length) fail.push('깜빡이 → 퀴즈 전환 실패');
    A.SET.flashLoop = true;
    // 노출 횟수가 저장되어 다음에는 '덜 본 단어'를 먼저 보여 준다
    A.startFlash(); A.exitFlash();
    const fcs = JSON.parse(box.localStorage.getItem('bvq_flash') || '{}');
    if (!Object.keys(fcs).length) fail.push('깜빡이 노출 횟수가 저장되지 않음');
    const first = A.getS && A.flashDeck();
    if (first.some(id => (fcs[id] || 0) > Math.min(...first.map(i => fcs[i] || 0)) + 5)) fail.push('덜 본 단어 우선 정렬 이상');
    note('깜빡이: 1단계(영어+발음기호) → 2단계(뜻·예문) → 반복/완료 → 퀴즈 연결 확인');
  }
  A.clearSession();
}

/* ---------- 9. 화면 설정 (테마 · 음영 대비) ---------- */
console.log('\n[9] 화면 설정 (테마 · 음영 대비)');
{
  if (A.SET.theme !== 'auto' || A.SET.hc) fail.push('테마 기본값이 자동/보통이 아님');
  A.UI.setSheet = true;
  let h = A.themeSheetHtml();
  for (const t of ['자동', '밝게', '어둡게', '블랙', '음영 대비', '고대비', '미리보기'])
    if (!h.includes(t)) fail.push('화면 설정 시트에 "' + t + '" 가 없음');
  if (/undefined|NaN|\[object /.test(h)) fail.push('화면 설정 시트 템플릿 오류');
  A.UI.setSheet = false;
  if (A.themeSheetHtml() !== '') fail.push('닫힌 화면 설정 시트가 렌더링됨');
  A.setTheme('dark'); if (A.SET.theme !== 'dark') fail.push('setTheme 이 저장되지 않음');
  A.setTheme('black'); if (A.SET.theme !== 'black') fail.push('블랙 테마가 저장되지 않음');
  if (!/--cloud:#000000/.test(css.split('data-mode="black"')[1] || '')) fail.push('블랙 테마 배경이 완전한 검정(#000000)이 아님');
  A.toggleHC(); if (!A.SET.hc) fail.push('toggleHC 가 켜지지 않음');
  if (!JSON.parse(box.localStorage.getItem('bvq_set') || '{}').hc) fail.push('고대비 설정이 저장되지 않음');
  if (!A.hcBtn().includes('aria-pressed="true"')) fail.push('고대비 버튼 상태 표시 오류');
  A.toggleHC(); A.setTheme('auto');
  // CSS: 라이트/다크 × 고대비 변수 블록이 모두 있어야 한다
  for (const sel of ['data-mode="light"', 'data-mode="dark"', 'data-mode="black"', 'data-hc="1"][data-mode="light"', 'data-hc="1"][data-mode="dark"'])
    if (!css.includes(sel)) fail.push('CSS 에 ' + sel + ' 블록이 없음');
  note('테마(자동·밝게·어둡게·블랙) · 고대비 토글 · 저장 · CSS 변수 블록 확인');

  // 모바일 자동 전체화면: 조건표
  const base = {auto: true, mobile: true, supported: true, standalone: false, active: false, done: false};
  const cases = [
    [base, true, '폰 브라우저에서 처음 누를 때'],
    [{...base, auto: false}, false, '설정을 끄면'],
    [{...base, mobile: false}, false, 'PC 에서는'],
    [{...base, supported: false}, false, '전체화면 미지원(아이폰 사파리)'],
    [{...base, standalone: true}, false, '이미 설치한 앱(manifest 로 전체화면)'],
    [{...base, active: true}, false, '이미 전체화면'],
    [{...base, done: true}, false, '이미 한 번 들어갔거나 사용자가 나간 뒤'],
  ];
  for (const [e, want, label] of cases)
    if (A.autoFsWanted(e) !== want) fail.push('자동 전체화면 조건 오류: ' + label + ' → 기대 ' + want);
  if (A.SET.autoFs !== true) fail.push('자동 전체화면 기본값이 켜짐이 아님');
  A.UI.setSheet = true;
  if (!A.themeSheetHtml().includes('모바일 자동 전체화면')) fail.push('화면 설정에 자동 전체화면 옵션이 없음');
  A.UI.setSheet = false;
  A.setAutoFs(false); if (A.SET.autoFs) fail.push('setAutoFs(false) 동작 오류');
  A.setAutoFs(true);
  if (A.iosHintHtml() !== '') fail.push('아이폰이 아닌데 아이폰 안내가 보임');
  const mfx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.webmanifest'), 'utf8'));
  if (mfx.display !== 'fullscreen' || (mfx.display_override || [])[0] !== 'fullscreen') fail.push('manifest 가 전체화면으로 열리도록 설정돼 있지 않음');
  // 전체화면 배너(직접 누르는 방식): 폰 브라우저에서만, 전체화면이 아닐 때만
  const bb = {mobile: true, supported: true, standalone: false, active: false, dismissed: false, exited: false};
  for (const [e, want, label] of [[bb, true, '폰 브라우저'], [{...bb, mobile: false}, false, 'PC'], [{...bb, supported: false}, false, '미지원'],
      [{...bb, standalone: true}, false, '설치한 앱'], [{...bb, active: true}, false, '이미 전체화면'],
      [{...bb, dismissed: true}, false, '사용자가 닫음'], [{...bb, exited: true}, false, '사용자가 직접 나간 뒤']])
    if (A.fsBannerWanted(e) !== want) fail.push('전체화면 배너 조건 오류: ' + label);
  if (A.fsBannerHtml() !== '') fail.push('PC(비모바일)에서 전체화면 배너가 보임');
  note('자동 전체화면 조건 7가지 · 배너 조건 7가지 · 설정 토글 · manifest fullscreen 확인');
}

/* ---------- 결과 ---------- */
console.log('\n' + '='.repeat(52));
if (fail.length) {
  console.log(`실패 ${fail.length}건\n`);
  fail.forEach(f => console.log('  ✕ ' + f));
  process.exit(1);
}
console.log('전체 통과');
