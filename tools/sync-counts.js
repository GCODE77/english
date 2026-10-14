#!/usr/bin/env node
/**
 * data/*.js 의 실제 단어·문법 개수를 세어 index.html 의 TRACK_COUNTS 를 갱신한다.
 * 데이터 파일을 고치거나 항목을 추가한 뒤 반드시 실행할 것:  node tools/sync-counts.js
 * (홈의 트랙 선택창은 데이터를 불러오기 전에 이 개수를 보여 준다. 어긋나면 verify.js 가 실패한다.)
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ORDER = ['toddler', 'child', 'elem', 'mid', 'high', 'univ', 'work'];

const counts = {};
for (const t of ORDER) {
  let got = null;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data', t + '.js'), 'utf8'),
    {__bvqLoad: (track, d) => { got = {track, w: d.words.length, g: d.grammar.length}; }});
  if (!got || got.track !== t) throw new Error(t + '.js 가 __bvqLoad("' + t + '", ...) 로 시작하지 않음');
  counts[t] = {w: got.w, g: got.g};
}

const file = path.join(ROOT, 'index.html');
const html = fs.readFileSync(file, 'utf8');
const re = /const TRACK_COUNTS = \{.*?\};/;
if (!re.test(html)) throw new Error('index.html 에서 TRACK_COUNTS 를 찾지 못함');
const next = html.replace(re, () => 'const TRACK_COUNTS = ' + JSON.stringify(counts) + ';');
if (next !== html) { fs.writeFileSync(file, next); console.log('TRACK_COUNTS 갱신'); }
else console.log('이미 최신');
console.log(JSON.stringify(counts));
