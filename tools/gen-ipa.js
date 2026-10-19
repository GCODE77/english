#!/usr/bin/env node
/**
 * CMU 발음 사전(CMUdict, 미국식 General American, Carnegie Mellon University, BSD 계열 라이선스)으로
 * data/*.js 의 단어에 발음기호(ipa)를 채운다. 이미 ipa 가 있는 단어는 건드리지 않는다(사람이 확인한 값 우선).
 * 지어내지 않는다: 사전에 없는 단어는 비워 둔다.
 *
 * 사용:
 *   node tools/gen-ipa.js <cmudict.dict 경로>           # 보고만 (파일 변경 없음)
 *   node tools/gen-ipa.js <cmudict.dict 경로> --write   # data/*.js 에 반영
 * 사전 파일: https://github.com/cmusphinx/cmudict (cmudict.dict)
 *
 * 표기는 기존 직장인 단어의 IPA 스타일(예: /ˈlevərɪdʒ/, /ˈfɔːrkæst/)에 맞췄다.
 */
const fs = require('fs');
const path = require('path');

const [dictPath, flag] = process.argv.slice(2);
if (!dictPath) { console.error('사용: node tools/gen-ipa.js <cmudict.dict> [--write]'); process.exit(1); }
const WRITE = flag === '--write';
const ROOT = path.join(__dirname, '..');
const TRACKS = ['toddler', 'child', 'elem', 'mid', 'high', 'univ', 'work'];

/* ---------- 사전 읽기 (첫 번째 발음만 사용) ---------- */
const dict = new Map();
for (const line of fs.readFileSync(dictPath, 'utf8').split('\n')) {
  const m = /^(\S+?)(?:\(\d+\))?\s+(.+)$/.exec(line.trim());
  if (!m) continue;
  const w = m[1].toLowerCase();
  if (!dict.has(w)) dict.set(w, m[2].split(/\s+/));
}

/* ---------- ARPAbet → IPA ---------- */
const CONS = {B:'b', CH:'tʃ', D:'d', DH:'ð', F:'f', G:'ɡ', HH:'h', JH:'dʒ', K:'k', L:'l', M:'m', N:'n', NG:'ŋ',
  P:'p', R:'r', S:'s', SH:'ʃ', T:'t', TH:'θ', V:'v', W:'w', Y:'j', Z:'z', ZH:'ʒ'};
const vowel = (p, stress) => {
  switch (p) {
    case 'AA': return 'ɑː';
    case 'AE': return 'æ';
    case 'AH': return stress ? 'ʌ' : 'ə';
    case 'AO': return 'ɔː';
    case 'AW': return 'aʊ';
    case 'AY': return 'aɪ';
    case 'EH': return 'e';
    case 'ER': return stress ? 'ɜːr' : 'ər';
    case 'EY': return 'eɪ';
    case 'IH': return 'ɪ';
    case 'IY': return stress ? 'iː' : 'i';
    case 'OW': return 'oʊ';
    case 'OY': return 'ɔɪ';
    case 'UH': return 'ʊ';
    case 'UW': return stress ? 'uː' : 'u';
  }
  throw new Error('알 수 없는 모음 ' + p);
};
const isVowel = p => /\d$/.test(p);

// 음절 머리(onset)로 허용되는 자음 연쇄
const STOP = ['P', 'B', 'T', 'D', 'K', 'G'];
function validOnset(seq) {
  const n = seq.length;
  if (n === 1) return seq[0] !== 'NG';
  if (n === 2) {
    const [a, b] = seq;
    if ([...STOP, 'F', 'TH', 'SH'].includes(a) && (b === 'R' || (b === 'L' && a !== 'T' && a !== 'D' && a !== 'SH'))) return true;
    if (['K', 'G', 'T', 'D', 'TH', 'S'].includes(a) && b === 'W') return true;
    if (a === 'S' && ['L', 'M', 'N', 'P', 'T', 'K', 'F'].includes(b)) return true;
    if (['P', 'B', 'F', 'M', 'K', 'G', 'V', 'HH', 'T', 'D', 'N', 'S', 'Z', 'L', 'TH'].includes(a) && b === 'Y') return true;
    return false;
  }
  if (n === 3) return seq[0] === 'S' && ['P', 'T', 'K'].includes(seq[1]) && ['L', 'R', 'W', 'Y'].includes(seq[2]);
  return false;
}

function toIPA(phones) {
  // 모음 위치
  const vIdx = phones.map((p, i) => isVowel(p) ? i : -1).filter(i => i >= 0);
  if (!vIdx.length) throw new Error('모음 없음');
  // 음절 경계: 모음 사이 자음 연쇄를 최대 onset 으로 나눈다
  const starts = [0];
  for (let k = 1; k < vIdx.length; k++) {
    const from = vIdx[k - 1] + 1, to = vIdx[k];
    let onsetLen = 0;
    for (let L = Math.min(3, to - from); L >= 1; L--) {
      if (validOnset(phones.slice(to - L, to))) { onsetLen = L; break; }
    }
    starts.push(to - onsetLen);
  }
  const sylls = starts.map((st, k) => phones.slice(st, k + 1 < starts.length ? starts[k + 1] : phones.length));
  const mono = sylls.length === 1;
  return sylls.map(sy => {
    const v = sy.find(isVowel), stress = v.slice(-1);
    const mark = mono ? '' : stress === '1' ? 'ˈ' : stress === '2' ? 'ˌ' : '';
    return mark + sy.map(p => isVowel(p) ? vowel(p.slice(0, -1), stress !== '0') : CONS[p]).join('');
  }).join('');
}

function ipaOfTerm(term) {
  const toks = term.toLowerCase().split(/[\s-]+/).filter(Boolean);
  const parts = [];
  for (const t of toks) {
    const ph = dict.get(t);
    if (!ph) return null;
    parts.push(toIPA(ph));
  }
  return '/' + parts.join(' ') + '/';
}

/* ---------- 변환기 자체 검증: 사람이 확인한 기존 IPA 와 비교 ---------- */
const same = (a, b) => a.replace(/[ˈˌ]/g, '') === b.replace(/[ˈˌ]/g, '');   // 강세 기호를 뺀 소리값
let cmp = 0, exact = 0, soundOk = 0; const diffs = [];
const files = {};
for (const t of TRACKS) files[t] = fs.readFileSync(path.join(ROOT, 'data', t + '.js'), 'utf8').split('\r\n').join('\n').split('\n');
for (const t of TRACKS) for (const line of files[t]) {
  const o = parseLine(line);
  if (!o || !o.ipa) continue;
  const g = ipaOfTerm(o.term);
  if (!g) continue;
  cmp++;
  if (g === o.ipa) exact++;
  if (same(g, o.ipa)) soundOk++; else diffs.push(o.term + ' 기존 ' + o.ipa + ' / 생성 ' + g);
}
function parseLine(line) {
  const m = /^(\{.*\})(,?)$/.exec(line);
  if (!m) return null;
  try { const o = JSON.parse(m[1]); return o.term ? o : null; } catch (e) { return null; }
}
console.log(`변환기 검증: 기존 IPA ${cmp}개와 비교 → 완전 일치 ${exact}개, 소리값 일치(강세 기호 제외) ${soundOk}개`);
diffs.slice(0, 12).forEach(d => console.log('  차이: ' + d));

/* ---------- 채우기 ---------- */
let total = 0, filled = 0, kept = 0; const missing = [];
for (const t of TRACKS) {
  let changed = false;
  files[t] = files[t].map(line => {
    const m = /^(\{.*\})(,?)$/.exec(line);
    if (!m) return line;
    let o; try { o = JSON.parse(m[1]); } catch (e) { return line; }
    if (!o.term || !o.meaningKo) return line;                 // 단어 항목만 (문법 항목 제외)
    total++;
    if (o.ipa) { kept++; return line; }
    const ipa = ipaOfTerm(o.term);
    if (!ipa) { missing.push(t + ':' + o.term); return line; }
    filled++; changed = true;
    const out = {id: o.id, term: o.term, ipa};
    for (const k of Object.keys(o)) if (!(k in out)) out[k] = o[k];
    return JSON.stringify(out) + m[2];
  });
  if (WRITE && changed) fs.writeFileSync(path.join(ROOT, 'data', t + '.js'), files[t].join('\n'));
}
console.log(`단어 ${total}개: 기존 IPA 유지 ${kept} · 새로 채움 ${filled} · 사전에 없어 비움 ${missing.length}`);
console.log('비운 단어 예: ' + missing.slice(0, 40).join(', '));
console.log(WRITE ? 'data/*.js 에 반영했습니다.' : '(보고만 했습니다. 반영하려면 --write)');
