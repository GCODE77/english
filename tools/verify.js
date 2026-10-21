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
    SpeechSynthesisUtterance: function (t) { this.text = t; },
    history: { hp: 0, hb: 0, onpop: null, pushState() { this.hp++; }, back() { this.hb++; if (this.onpop) this.onpop(); } }
  };
  box.window.speechSynthesis = box.speechSynthesis;
  vm.createContext(box);
  vm.runInContext(
    src.replace(/^render\(\);$/m, '') +
    ';globalThis.A={WORDS,GRAMMAR,home,study,quiz,result,library,start,answer,next,' +
    'setPick,openLibrary,libTab,blankOut,build,buildG,explain,explainG,scoreFor,TRACK_COUNTS,LOADED,SND,TTS,render,goHome,closeSession,saveSession,readSession,resumeSession,clearSession,toggleSound,SET,AUTO,flash,flashdone,startFlash,flashStep,flashDeck,flashQuiz,exitFlash,flashTap,studyNext,UI,setTheme,toggleHC,themeSheetHtml,toggleSetSheet,hcBtn,autoFsWanted,setAutoFs,iosHintHtml,fsBannerWanted,fsBannerHtml,onBack,syncHistory,navBase,backupText,parseBackup,toggleFav,isFav,setSize,sizeN,importSheetHtml,setTtsSlow,toggleBlack,blackBtn,themeMode,weakQuiz,flashWeak,flashWrong,setLibStatus,getP:()=>P,getS:()=>S};',
    box
  );
  for (const t of TRACK_IDS)
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'data', t + '.js'), 'utf8'), box);
  return box;
}

const box = makeBox();
const A = box.A;
box.history.onpop = () => A.onBack();

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
  // 블랙 화면은 '깜빡이 전용': 깜빡이 화면에서만 검정이고, 홈·다른 화면은 원래 테마를 유지한다
  const modeCases = [
    ['light', false, 'home', true, 'light', '홈은 깜빡이 블랙 설정과 무관'],
    ['light', false, 'flash', true, 'black', '깜빡이 + 블랙 켬'],
    ['light', false, 'flashdone', true, 'black', '깜빡이 완료 화면도 블랙 유지'],
    ['light', false, 'flash', false, 'light', '깜빡이 + 블랙 끔'],
    ['auto', true, 'home', false, 'dark', '자동 + 폰 다크'],
    ['auto', false, 'quiz', true, 'light', '퀴즈는 깜빡이 블랙 설정과 무관'],
    ['black', false, 'home', false, 'black', '앱 전체 블랙 테마(설정)'],
    ['dark', false, 'flash', true, 'black', '어둡게 + 깜빡이 블랙'],
  ];
  for (const [th, sys, scr, fb, want, label] of modeCases)
    if (A.themeMode(th, sys, scr, fb) !== want) fail.push('테마 모드 오류: ' + label + ' → 기대 ' + want + ' 실제 ' + A.themeMode(th, sys, scr, fb));
  A.setTheme('light'); A.SET.flashBlack = false;
  A.setPick('track', 'elem'); A.startFlash();
  if (!A.flash().includes('id="blackbtn"')) fail.push('깜빡이 화면에 블랙 버튼이 없음');
  if (!A.flash().includes('끝내기')) fail.push('깜빡이 화면에 끝내기 버튼이 없음');
  A.toggleBlack();
  if (!A.SET.flashBlack) fail.push('깜빡이 블랙 버튼이 켜지지 않음');
  if (A.SET.theme !== 'light') fail.push('깜빡이 블랙이 앱 전체 테마를 바꿨음(홈까지 검정이 되는 버그): ' + A.SET.theme);
  if (!A.blackBtn().includes('aria-pressed="true"')) fail.push('블랙 버튼 상태 표시 오류');
  A.exitFlash();
  if (A.SET.theme !== 'light') fail.push('깜빡이를 나갔는데 테마가 바뀌어 있음: ' + A.SET.theme);
  A.toggleBlack();       // 홈에서 눌러도 앱 전체 테마는 그대로
  if (A.SET.theme !== 'light' || A.SET.flashBlack) fail.push('깜빡이 블랙 끄기 오류');
  A.setTheme('auto');

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

/* ---------- 10. 학습 노트 ---------- */
console.log('\n[10] 학습 노트');
{
  A.setPick('track', 'elem');
  A.openLibrary();
  let h = A.library();
  for (const t of ['aria-label="홈으로"', '학습 노트', '약점 노트'])
    if (!h.includes(t)) fail.push('학습 노트에 "' + t + '" 가 없음');
  if (/undefined|NaN|\[object /.test(h)) fail.push('학습 노트 템플릿 오류');
  if (h.includes('아직 틀린 문제가 없습니다')) fail.push('약점 노트가 비어 있음(통계 연결 실패)');
  if (!h.includes('약점만 퀴즈 풀기')) fail.push('약점 노트에 퀴즈 버튼이 없음');
  if (!h.includes('약점 단어 깜빡이로 보기')) fail.push('약점 노트에 깜빡이 버튼이 없음');
  A.libTab('words');
  h = A.library();
  for (const t of ['약점', '학습중', '습득', '미학습'])
    if (!h.includes('>' + t + '</button>')) fail.push('단어 탭에 상태 필터 "' + t + '" 가 없음');
  if (!h.includes('data-st="')) fail.push('목록 항목에 data-st 가 없음');
  A.setLibStatus('b-bad');
  A.weakQuiz();
  const st = A.getS();
  if (st.screen !== 'quiz' || !st.qs.length || st.qs.length > 10) fail.push('약점 퀴즈가 만들어지지 않음');
  const prevDeck = A.SET.flashDeck;
  A.flashWeak();
  if (A.SET.flashDeck !== 'weak' || A.getS().screen !== 'flash') fail.push('약점 단어 깜빡이가 시작되지 않음');
  A.exitFlash(); A.SET.flashDeck = prevDeck;
  note('학습 노트: 홈 버튼 · 상태 필터 · 약점 퀴즈 · 약점 깜빡이 확인');
}

/* ---------- 11. 결과 화면 흐름 ---------- */
console.log('\n[11] 결과 화면 흐름');
{
  A.setPick('track', 'elem');
  const w = A.WORDS.find(x => x.track === 'elem');
  const st = A.getS();
  st.screen = 'result'; st.qs = [{kind: 'w', w, id: w.id, opts: [], mode: 'MEANING', prompt: w.term}];
  st.wrong = [{kind: 'w', w, id: w.id}]; st.right = 0; st.score = 0; st.best = 0;
  const h = A.result();
  if (/undefined|NaN|\[object /.test(h)) fail.push('결과 화면 템플릿 오류');
  if (!h.includes('틀린 1문제 바로 다시 풀기')) fail.push('결과 화면에 다시 풀기 버튼이 없음');
  if (!h.includes('틀린 단어 깜빡이로 외우기')) fail.push('결과 화면에 틀린 단어 깜빡이 버튼이 없음');
  if (h.includes('복습이 필요합니다')) fail.push('결과 제목이 부정적인 문구로 남아 있음');
  A.flashWrong();
  const fl = A.getS();
  if (fl.screen !== 'flash' || fl.fl.deck.length !== 1 || fl.fl.deck[0] !== w.id) fail.push('틀린 단어 깜빡이가 그 단어로 시작되지 않음');
  A.exitFlash();
  // 첫 접속의 트랙 선택창은 아직 아무것도 고르지 않았으므로 '선택됨'을 표시하면 안 된다
  A.UI.sheet = true; A.UI.firstRun = true;
  if (A.home().includes('선택됨')) fail.push('첫 접속 선택창에 선택됨 표시가 있음');
  A.UI.firstRun = false;
  if (!A.home().includes('선택됨')) fail.push('트랙을 고른 뒤 선택창에 선택됨 표시가 없음');
  A.UI.sheet = false;
  note('결과 → 틀린 단어 깜빡이 연결 · 첫 접속 선택 표시 확인');
}

/* ---------- 12. 뒤로가기 ---------- */
console.log('\n[12] 뒤로가기');
{
  const h = box.history;
  A.UI.sheet = false; A.UI.flashSheet = false; A.UI.setSheet = false;
  A.setPick('track', 'elem'); A.SET.flashDeck = 'least';
  A.exitFlash ? A.exitFlash() : 0;
  // 퀴즈 중 뒤로가기 → 홈, 기록 보존
  A.setPick('cat', 'word'); A.start();
  let st = A.getS(); if (st.screen === 'study') { st.screen = 'quiz'; A.render(); }
  const hp0 = h.hp;
  st = A.getS();
  const q = st.qs[st.i]; A.answer(q.kind === 'g' ? q.g.answer : q.w.id);
  A.onBack();
  if (A.getS().screen !== 'home') fail.push('퀴즈 중 뒤로가기가 홈으로 가지 않음');
  if (!A.readSession()) fail.push('뒤로가기로 나갔는데 이어서 하기 저장본이 없음');
  // 시트가 열려 있을 때 뒤로가기 → 시트만 닫힌다
  A.UI.setSheet = true; A.render();
  if (A.navBase()) fail.push('시트가 열려 있는데 navBase 가 참');
  A.onBack();
  if (A.UI.setSheet) fail.push('뒤로가기가 설정 시트를 닫지 않음');
  if (A.getS().screen !== 'home') fail.push('시트 위에서 뒤로가기가 화면까지 바꿈');
  // 화면 → 직접 홈 버튼으로 나가면 쌓아 둔 히스토리를 치운다
  A.clearSession();
  A.startFlash(); A.exitFlash();
  if (h.hb < 1) fail.push('앱 안에서 홈으로 돌아갔는데 쌓아 둔 히스토리를 치우지 않음 (뒤로가기가 두 번 필요해짐)');
  if (h.hp < 2) fail.push('화면 전환 때 히스토리를 쌓지 않음');
  // 홈으로 돌아오며 history.back()을 부른 직후 바로 시트를 열어도, 그 popstate 가 시트를 닫아 버리면 안 된다
  A.setPick('track', 'elem'); A.startFlash();
  A.exitFlash();                                   // 내부에서 history.back() → popstate(무시되어야 함)
  A.UI.setSheet = true; A.render();
  if (!A.UI.setSheet) fail.push('홈 복귀 직후 연 시트가 직접 요청한 history.back() 이벤트에 닫힘');
  A.onBack();                                      // 이제 진짜 사용자 뒤로가기
  if (A.UI.setSheet) fail.push('사용자 뒤로가기가 시트를 닫지 않음');
  note('뒤로가기: 퀴즈→홈(기록 보존) · 시트만 닫기 · 히스토리 정리 · 연속 조작 경합 확인');
}

/* ---------- 13. 즐겨찾기 · 백업 · 문제 수 · 발음 속도 ---------- */
console.log('\n[13] 즐겨찾기 · 백업 · 문제 수 · 발음 속도');
{
  A.setPick('track', 'elem');
  // 즐겨찾기
  const ws = A.WORDS.filter(w => w.track === 'elem').slice(0, 3);
  ws.forEach(w => A.toggleFav({dataset: {fav: w.id}}));
  if (!ws.every(w => A.isFav(w.id))) fail.push('즐겨찾기가 담기지 않음');
  if (Object.keys(JSON.parse(box.localStorage.getItem('bvq_fav') || '{}')).length !== 3) fail.push('즐겨찾기가 저장되지 않음');
  A.SET.flashDeck = 'fav'; A.SET.flashCount = 20;
  const deck = A.flashDeck();
  if (deck.length !== 3 || deck.some(id => !ws.find(w => w.id === id))) fail.push('깜빡이 즐겨찾기 범위가 즐겨찾기 단어만 담지 않음');
  A.toggleFav({dataset: {fav: ws[0].id}});
  if (A.isFav(ws[0].id) || A.flashDeck().length !== 2) fail.push('즐겨찾기 해제가 반영되지 않음');
  A.setPick('cat', 'word'); A.libTab ? A.openLibrary() : 0; A.libTab('words');
  const libHtml = A.library();
  if (!libHtml.includes('data-st="fav"') || !libHtml.includes('data-fav="')) fail.push('학습 노트 단어 탭에 즐겨찾기 필터/별이 없음');
  A.libTab('grammar');
  if (A.library().includes('data-st="fav"')) fail.push('문법 탭에 즐겨찾기 필터가 나옴');
  A.SET.flashDeck = 'least';
  A.toggleFav({dataset: {fav: ws[1].id}}); A.toggleFav({dataset: {fav: ws[2].id}});

  // 백업 · 복원 (불러오기는 location.reload 가 필요해 형식 검증만)
  const t = A.backupText();
  const r = A.parseBackup(t);
  if (!r.ok || !r.data.bvq_fav || !r.data.bvq) fail.push('백업 내용에 기록/즐겨찾기가 빠짐');
  if (A.parseBackup('이건 JSON 이 아니에요').ok) fail.push('JSON 이 아닌 백업을 받아들임');
  if (A.parseBackup(JSON.stringify({app: 'other', v: 1, data: {}})).ok) fail.push('다른 앱의 백업을 받아들임');
  if (A.parseBackup(JSON.stringify({app: 'english', v: 1, data: {bvq: '{깨진'}})).ok) fail.push('손상된 백업을 받아들임');
  if (A.parseBackup(JSON.stringify({app: 'english', v: 2, data: {}})).ok) fail.push('알 수 없는 버전의 백업을 받아들임');
  A.UI.importSheet = true;
  const ih = A.importSheetHtml();
  if (!ih.includes('bkText') || !ih.includes('type="file"')) fail.push('가져오기 시트에 입력창/파일 선택이 없음');
  A.UI.importSheet = false;
  if (A.importSheetHtml() !== '') fail.push('닫힌 가져오기 시트가 렌더링됨');
  A.UI.setSheet = true;
  const sh = A.themeSheetHtml();
  for (const tx of ['발음 속도', '한 번에 푸는 문제 수', '내 학습 기록', '파일로 저장', '가져오기']) if (!sh.includes(tx)) fail.push('설정에 "' + tx + '" 가 없음');
  A.UI.setSheet = false;

  // 문제 수
  for (const n of [5, 20, 10]) {
    A.setSize(n); A.setPick('cat', 'word'); A.start();
    let st = A.getS(); const got = st.qs.length;
    if (got !== n) fail.push('문제 수 ' + n + ' 설정인데 ' + got + '문제가 만들어짐');
    A.setPick('cat', 'mix'); A.start(); st = A.getS();
    const gN = st.qs.filter(q => q.kind === 'g').length, wN = st.qs.filter(q => q.kind === 'w').length;
    if (st.qs.length !== n || gN !== Math.max(1, Math.round(n * 0.3))) fail.push('섞어서 ' + n + '문제: 단어 ' + wN + ' + 문법 ' + gN);
  }
  A.setSize(10); A.clearSession();
  if (!A.home().includes('단어 7 + 문법 3')) fail.push('홈의 시작 버튼 설명이 문제 수를 반영하지 않음');

  // 발음 속도
  const rates = [];
  const origSpeak = box.speechSynthesis.speak;
  box.speechSynthesis.speak = u => { rates.push(u.rate); };
  A.setTtsSlow(false); A.TTS.say('hello');
  A.setTtsSlow(true); A.TTS.say('hello');
  A.TTS.say('hello', null, 0.55);
  box.speechSynthesis.speak = origSpeak; A.setTtsSlow(false);
  if (rates.join() !== '0.92,0.65,0.55') fail.push('발음 속도 오류: ' + rates.join());
  note('즐겨찾기 · 백업 형식 검증 · 문제 수 5/10/20 · 발음 속도 확인');
}

/* ---------- 14. 디자인 일관성 ---------- */
console.log('\n[14] 디자인 일관성');
{
  const ui = src.replace(/const IC = \{[\s\S]*?\n\};/, '');
  for (const e of ['🏠', '⚙', '📒', '⛶', '⏮', '⏭', '⏩', '⏱', '◐', '📤', '📋', '📥', '☆'])
    if (ui.includes('>' + e) || ui.includes("'" + e)) fail.push('화면 버튼에 이모지 아이콘이 남아 있음: ' + e + ' (ic() 선 아이콘을 쓸 것)');
  for (const v of ['--gold', '--gold-l', '--serif']) if (!new RegExp(v + '\\s*:').test(css)) fail.push('CSS 변수 정의 없음: ' + v);
  for (const f of ['icons/favicon-32.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'])
    if (!fs.existsSync(path.join(__dirname, '..', f))) fail.push('아이콘 파일 없음: ' + f);
  note('화면 버튼 선 아이콘 통일 · 프리미엄 색 변수 · 아이콘 파일 확인');
}

/* ---------- 결과 ---------- */
console.log('\n' + '='.repeat(52));
if (fail.length) {
  console.log(`실패 ${fail.length}건\n`);
  fail.forEach(f => console.log('  ✕ ' + f));
  process.exit(1);
}
console.log('전체 통과');
