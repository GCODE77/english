#!/usr/bin/env node
/**
 * 검사를 통과한 새 단어·문법 묶음 파일들을 data/<트랙>.js 뒤에 합친다.
 *   node tools/merge-batch.js <묶음 폴더> [--write]
 * 폴더 안의 words_<트랙>_*.json, grammar_<트랙>_*.json 을 모두 읽는다.
 * 파일끼리 겹치는 항목(같은 id·같은 단어·같은 뜻·같은 문장)은 뒤쪽을 버리고,
 * 버려진 단어를 짝으로 가리키던 항목은 짝에서 빼며, 짝이 2개 미만이 되면 그 단어도 버린다.
 * --write 가 없으면 보고만 한다. 합친 뒤에는 node tools/sync-counts.js, gen-ipa.js, verify.js 를 돌릴 것.
 */
const fs = require('fs');
const path = require('path');
const [dir, flag] = process.argv.slice(2);
if (!dir) { console.error('사용: node tools/merge-batch.js <폴더> [--write]'); process.exit(2); }
const WRITE = flag === '--write';
const ROOT = path.join(__dirname, '..');
const TRACKS = ['toddler', 'child', 'elem', 'mid', 'high', 'univ', 'work'];
const files = fs.readdirSync(dir).sort();
let grandW = 0, grandG = 0;

for (const t of TRACKS) {
  const wf = files.filter(f => f.startsWith('words_' + t + '_') && f.endsWith('.json'));
  const gf = files.filter(f => f.startsWith('grammar_' + t + '_') && f.endsWith('.json'));
  if (!wf.length && !gf.length) continue;
  let D = null; global.__bvqLoad = (n, d) => { D = d; };
  const dataPath = path.join(ROOT, 'data', t + '.js');
  delete require.cache[require.resolve(dataPath)];
  require(dataPath);
  const header = fs.readFileSync(dataPath, 'utf8').split('\n')[0];
  const base = JSON.parse(JSON.stringify(D));

  // ----- 단어 -----
  let words = [];
  wf.forEach(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).forEach(w => words.push(w)));
  const ids = new Set(base.words.map(w => w.id)), terms = new Set(base.words.map(w => w.term.toLowerCase())), means = new Set(base.words.map(w => w.meaningKo));
  const kept = [], dropped = [];
  for (const w of words) {
    const lc = w.term.toLowerCase();
    // 예문에 기본형이 그대로 없으면 빈칸 문제를 만들 수 없다 → 버린다
    const baseOk = new RegExp('\\b' + w.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(w.example || '');
    if (!baseOk || ids.has(w.id) || terms.has(lc) || means.has(w.meaningKo)) { dropped.push(w.id); continue; }
    ids.add(w.id); terms.add(lc); means.add(w.meaningKo); kept.push(w);
  }
  // 버려진 단어를 가리키는 짝을 정리하고, 짝이 모자란 단어는 연쇄적으로 버린다
  let live = kept, changed = true;
  while (changed) {
    changed = false;
    const alive = new Set(live.map(w => w.id));
    const next = [];
    for (const w of live) {
      const cs = (w.confusions || []).filter(c => alive.has(c.id));
      if (cs.length < 2) { dropped.push(w.id); changed = true; continue; }
      if (cs.length !== w.confusions.length) { w.confusions = cs; changed = true; }
      next.push(w);
    }
    live = next;
  }
  live.forEach(w => { delete w.track; delete w.ipa; });

  // ----- 문법 -----
  let gr = [];
  gf.forEach(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).forEach(g => gr.push(g)));
  const gids = new Set(base.grammar.map(g => g.id)), gfull = new Set(base.grammar.map(g => g.full.toLowerCase()));
  const gkept = []; let gdrop = 0;
  for (const g of gr) {
    if (gids.has(g.id) || gfull.has(g.full.toLowerCase())) { gdrop++; continue; }
    gids.add(g.id); gfull.add(g.full.toLowerCase()); gkept.push(g); delete g.track;
  }

  console.log(`${t}: 단어 +${live.length} (파일 ${words.length}개 중 ${words.length - live.length} 제외) → ${base.words.length + live.length} · 문법 +${gkept.length} (${gdrop} 제외) → ${base.grammar.length + gkept.length}`);
  grandW += live.length; grandG += gkept.length;
  if (!WRITE) continue;
  const out = header + '\n__bvqLoad(' + JSON.stringify(t) + ',{\n"words":[\n' + [...base.words, ...live].map(w => JSON.stringify(w)).join(',\n') +
    '\n],\n"grammar":[\n' + [...base.grammar, ...gkept].map(g => JSON.stringify(g)).join(',\n') + '\n]\n});\n';
  fs.writeFileSync(dataPath, out);
}
console.log(`합계: 단어 +${grandW}, 문법 +${grandG}` + (WRITE ? ' (data/*.js 에 반영함)' : ' (보고만, --write 로 반영)'));
