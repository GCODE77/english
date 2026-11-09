#!/usr/bin/env node
/**
 * 새 단어·문법·회화 묶음(JSON 배열 파일)이 verify.js 의 데이터 규칙을 지키는지 병합 전에 검사한다.
 *   node tools/check-batch.js words   <트랙> <파일.json>
 *   node tools/check-batch.js grammar <트랙> <파일.json>
 *   node tools/check-batch.js talk    <트랙> <파일.json>   (회화)
 * 단어 파일의 항목에는 track·ipa 를 쓰지 않는다(병합할 때 로더와 gen-ipa.js 가 채운다).
 * 오류가 하나라도 있으면 종료 코드 1. 오류가 없을 때까지 고쳐서 다시 돌릴 것.
 */
const fs = require('fs');
const path = require('path');
const [kind, track, file] = process.argv.slice(2);
if (!kind || !track || !file) { console.error('사용: node tools/check-batch.js <words|grammar|talk> <트랙> <파일.json>'); process.exit(2); }
const TRACKS = ['toddler', 'child', 'elem', 'mid', 'high', 'univ', 'work'];
if (!TRACKS.includes(track)) { console.error('트랙 이름 오류: ' + track); process.exit(2); }

let D = null;
global.__bvqLoad = (t, d) => { D = d; };
require(path.join(__dirname, '..', 'data', track + '.js'));
const existing = D;

let batch;
try { batch = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error('JSON 읽기 실패: ' + e.message); process.exit(1); }
if (!Array.isArray(batch)) { console.error('최상위는 배열이어야 함'); process.exit(1); }

const errs = [];
const err = (id, m) => errs.push(id + ': ' + m);
const POS = new Set(['명사', '동사', '형용사', '부사', '전치사', '접속사', '대명사', '감탄사', '동사구', '명사구', '부사구']);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

if (kind === 'words') {
  const ids = new Set(existing.words.map(w => w.id));
  const terms = new Map(existing.words.map(w => [w.term.toLowerCase(), w.id]));
  const meanings = new Map();
  existing.words.forEach(w => { (meanings.get(w.meaningKo) || meanings.set(w.meaningKo, []).get(w.meaningKo)).push(w.id); });
  const batchIds = new Set(batch.map(w => w.id));
  const levels = track === 'work' ? [1, 2, 3] : [1];
  for (const w of batch) {
    const id = w.id || '(id없음)';
    if (!/^[a-z0-9_]+$/.test(w.id || '')) err(id, 'id 는 영소문자·숫자·밑줄만');
    if (ids.has(w.id)) err(id, '이미 있는 id');
    ids.add(w.id);
    for (const k of ['term', 'meaningKo', 'pos', 'example', 'exampleKo']) if (!w[k] || typeof w[k] !== 'string') err(id, k + ' 누락');
    if (w.track !== undefined) err(id, 'track 필드를 쓰지 말 것');
    if (w.ipa !== undefined) err(id, 'ipa 필드를 쓰지 말 것(사전에서 채움)');
    if (!levels.includes(w.level)) err(id, 'level 은 ' + levels.join('/') + ' 중 하나');
    if (!POS.has(w.pos)) err(id, '품사 오류: ' + w.pos);
    if (w.term) {
      if (!/^[A-Za-z][A-Za-z' -]*$/.test(w.term)) err(id, "term 은 영문자·공백·하이픈·작은따옴표만: " + w.term);
      const lc = w.term.toLowerCase();
      if (terms.has(lc)) err(id, "이미 있는 단어(" + terms.get(lc) + "): " + w.term);
      terms.set(lc, w.id);
      const re = new RegExp('\\b' + esc(w.term) + '\\b', 'i');
      if (w.example && !re.test(w.example)) err(id, "예문에 기본형 '" + w.term + "' 가 그대로 없음(활용형 금지)");
    }
    if (w.meaningKo) { const l = meanings.get(w.meaningKo); if (l && l.length) err(id, "같은 뜻 '" + w.meaningKo + "' 이(가) 이미 있음(" + l[0] + ") — 뜻을 구분하거나 단어를 빼세요"); (meanings.get(w.meaningKo) || meanings.set(w.meaningKo, []).get(w.meaningKo)).push(w.id); }
    if (!Array.isArray(w.confusions) || w.confusions.length < 2) { err(id, '헷갈리는 짝(confusions) 2개 이상 필요'); continue; }
    const seen = new Set();
    for (const c of w.confusions) {
      if (!c || !c.id) { err(id, 'confusion 에 id 없음'); continue; }
      if (c.id === w.id) err(id, '자기 자신을 짝으로 지정');
      if (seen.has(c.id)) err(id, '짝 중복: ' + c.id); seen.add(c.id);
      if (!batchIds.has(c.id)) err(id, "짝 '" + c.id + "' 는 이 파일 안에 있는 단어여야 함");
      if (!c.note || c.note.length < 20) err(id, "짝 '" + c.id + "' 해설이 20자 미만(두 단어가 어떻게 다른지 구체적으로)");
    }
  }
  // 예문 힌트 유출: 예문에 짝 단어가 들어 있으면 빈칸 문제에서 소거 힌트가 된다
  const byId = new Map(batch.map(w => [w.id, w]));
  for (const w of batch) for (const c of (w.confusions || [])) {
    const o = byId.get(c.id);
    if (o && o.term && w.example && new RegExp('\\b' + esc(o.term) + '\\b', 'i').test(w.example)) err(w.id, "예문에 짝 단어 '" + o.term + "' 가 들어 있음(힌트 유출)");
  }
} else if (kind === 'grammar') {
  const ids = new Set(existing.grammar.map(g => g.id));
  const levels = track === 'work' ? [1, 2, 3] : [1];
  const sents = new Set(existing.grammar.map(g => g.full.toLowerCase()));
  for (const g of batch) {
    const id = g.id || '(id없음)';
    if (!/^[a-z0-9_]+$/.test(g.id || '')) err(id, 'id 는 영소문자·숫자·밑줄만');
    if (ids.has(g.id)) err(id, '이미 있는 id'); ids.add(g.id);
    if (g.full && sents.has(g.full.toLowerCase())) err(id, '같은 문장이 이미 있음: ' + g.full);
    if (g.full) sents.add(g.full.toLowerCase());
    if (g.track !== undefined) err(id, 'track 필드를 쓰지 말 것');
    if (!levels.includes(g.level)) err(id, 'level 은 ' + levels.join('/') + ' 중 하나');
    for (const k of ['topic', 'sentence', 'answer', 'ko', 'tip', 'full']) if (!g[k] || typeof g[k] !== 'string') err(id, k + ' 누락');
    if (!g.sentence || !g.answer || !Array.isArray(g.options) || !g.notes || !g.full) continue;
    if ((g.sentence.match(/___/g) || []).length !== 1) err(id, "sentence 에는 '___' 가 정확히 한 번");
    if (g.options.length !== 4) err(id, '보기는 4개');
    if (new Set(g.options.map(o => String(o).toLowerCase())).size !== 4) err(id, '보기 중복');
    if (!g.options.includes(g.answer)) err(id, '보기에 정답이 없음');
    for (const o of g.options) {
      if (o === g.answer) continue;
      if (!g.notes[o]) err(id, "오답 '" + o + "' 해설 없음");
      else if (g.notes[o].length < 20) err(id, "오답 '" + o + "' 해설 20자 미만");
      if (/[,(]/.test(o)) err(id, "보기 '" + o + "' 에 콤마·괄호 금지");
    }
    for (const k of Object.keys(g.notes)) if (!g.options.includes(k) || k === g.answer) err(id, "notes 의 키 '" + k + "' 가 오답 보기가 아님");
    if (g.full.includes('___')) err(id, 'full 에 빈칸이 남음');
    if (g.sentence.includes('___') && g.full !== g.sentence.replace('___', g.answer)) err(id, "full 은 sentence 의 '___' 를 정답으로 채운 문장이어야 함");
    if (new RegExp('\\b' + esc(g.answer) + '\\b', 'i').test(g.sentence.replace('___', '§'))) err(id, '문제 문장에 정답이 이미 들어 있음');
    if ((g.tip || '').length < 12) err(id, 'tip(규칙 설명) 12자 이상');
  }
} else if (kind === 'talk') {
  // 회화: [{id,c,t,l:[[화자,영어,한국어,(B만)[[오답,해설]x2]]...]}] — 트랙 인자는 무시하고 기존 id·제목만 겹치지 않게 본다
  let T = null; global.__bvqTalk = d => { T = d; };
  require(path.join(__dirname, '..', 'data', 'talk.js'));
  const ids = new Set(), titles = new Set((T[track] || []).map(d => d.t));
  Object.values(T).forEach(a => a.forEach(d => ids.add(d.id)));
  const CATS = ['hi', 'home', 'school', 'shop', 'go', 'med', 'fun', 'work'];
  for (const d of batch) {
    const id = d.id || '(id없음)';
    if (!/^[a-z0-9_]+$/.test(d.id || '')) err(id, 'id 는 영소문자·숫자·밑줄만');
    if (ids.has(d.id)) err(id, '이미 있는 id'); ids.add(d.id);
    if (!CATS.includes(d.c)) err(id, '분류(c) 오류: ' + d.c);
    if (!d.t) err(id, '제목 없음'); else { if (titles.has(d.t)) err(id, '이 트랙에 같은 제목이 이미 있음: ' + d.t); titles.add(d.t); }
    if (!Array.isArray(d.l) || d.l.length !== 6) { err(id, '줄 수는 6줄'); continue; }
    d.l.forEach((l, i) => {
      const tag = id + '#' + i;
      if (l[0] !== (i % 2 ? 'B' : 'A')) err(tag, 'A로 시작해 A,B 번갈아야 함');
      if (!l[1] || !l[2]) err(tag, '영어/한국어 누락');
      if (l[0] === 'B') {
        const w = l[3] || [];
        if (w.length !== 2) err(tag, '오답은 정확히 2개');
        const all = [l[1], ...w.map(x => x[0])];
        if (new Set(all.map(x => String(x).toLowerCase())).size !== 3) err(tag, '보기 중복');
        w.forEach(x => { if (!x[1] || x[1].length < 10) err(tag, "오답 해설 10자 미만: " + x[0]); });
      } else if (l.length !== 3) err(tag, 'A 줄은 [A,영어,한국어] 3칸');
    });
  }
} else { console.error('kind 는 words, grammar, talk 중 하나'); process.exit(2); }

const n = batch.length;
if (errs.length) {
  console.log('오류 ' + errs.length + '건 (항목 ' + n + '개)');
  errs.slice(0, 60).forEach(e => console.log('  ✕ ' + e));
  if (errs.length > 60) console.log('  … 외 ' + (errs.length - 60) + '건');
  process.exit(1);
}
console.log('통과: ' + kind + ' ' + n + '개 (' + track + ')');
