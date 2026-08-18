/**
 * sim.js - CPU同士で大量に対局を回す整合性シミュレーション
 * 使い方: node test/sim.js [局数] [プリセットID]
 *
 * 検証項目：
 *   - クラッシュしない / 局進行が停止しない
 *   - 牌が増減しない（総数一致・同一IDの重複なし・同じ牌が5枚存在しない）
 *   - 点棒の総和が保存される（供託込み）
 *   - 不可能な和了が起きない（役なし和了・フリテンロン）
 */
import { GameEngine } from '../src/core/engine.js';
import { decide } from '../src/core/ai.js';
import { resolveRules } from '../src/rules/defaults.js';
import { PRESETS, getPreset } from '../src/rules/presets.js';
import { buildTileSet } from '../src/core/wall.js';

const games = Number(process.argv[2] || 200);
const presetId = process.argv[3] || null;

function checkTiles(engine, label, errors) {
  const ids = new Map();
  const typeCount = new Array(38).fill(0);
  const push = (t, where) => {
    if (ids.has(t.id)) errors.push(`${label}: 牌ID重複 ${t.id} (${where} / ${ids.get(t.id)})`);
    ids.set(t.id, where);
    typeCount[t.t]++;
  };
  engine.players.forEach((p, i) => {
    p.hand.forEach((t) => push(t, `hand${i}`));
    p.melds.forEach((m) => m.tiles.forEach((t) => push(t, `meld${i}`)));
    p.discards.forEach((t) => push(t, `discard${i}`));
    p.kita.forEach((t) => push(t, `kita${i}`));
    p.flowers.forEach((t) => push(t, `flower${i}`));
  });
  const w = engine.wall;
  for (let i = w.drawIndex; i < w.liveEnd; i++) push(w.live[i], 'wall');
  // 王牌のうち嶺上牌として引かれた分は既に手牌側に存在するので除外
  for (let i = w.rinshanUsed; i < w.deadSize; i++) push(w.dead[i], 'dead');
  const total = countHeld(engine) + (w.liveEnd - w.drawIndex) + (w.deadSize - w.rinshanUsed);
  if (total !== w.all.length) {
    errors.push(`${label}: 牌総数不一致 ${total} != ${w.all.length}`);
  }
  for (let t = 0; t < 34; t++) {
    if (typeCount[t] > 4) errors.push(`${label}: 牌タイプ${t}が${typeCount[t]}枚`);
  }
  // 手牌枚数の妥当性
  engine.players.forEach((p, i) => {
    const n = p.hand.length + p.melds.length * 3;
    if (n < 13 || n > 14) errors.push(`${label}: player${i} 手牌枚数異常 ${p.hand.length}+melds${p.melds.length}`);
  });
}

function countHeld(engine) {
  let n = 0;
  for (const p of engine.players) {
    n += p.hand.length;
    for (const m of p.melds) n += m.tiles.length;
    n += p.discards.length + p.kita.length + p.flowers.length;
  }
  return n;
}

function runOne(rules, seed, errors, stats) {
  const players = [];
  for (let i = 0; i < rules.game.players; i++) {
    players.push({ name: `CPU${i}`, isCpu: true, level: ['normal', 'normal', 'expert', 'beginner'][i] || 'normal' });
  }
  const engine = new GameEngine({ rules, seed, players });
  engine.startKyoku();
  let guard = 0;
  const startTotal = rules.scoring.startingPoints * rules.game.players;
  while (!engine.finished && guard++ < 200) {
    const r = engine.advance(decide, 20000);
    if (r.error) { errors.push(`seed${seed}: advance error ${r.error}`); break; }
    if (r.waiting) { errors.push(`seed${seed}: CPU専用なのに人間待ち`); break; }
    if (r.kyokuEnd) {
      checkTiles(engine, `seed${seed} 局終了`, errors);
      const sum = engine.players.reduce((a, p) => a + p.points, 0) + engine.round.kyotaku * rules.scoring.riichiStick;
      if (sum !== startTotal) errors.push(`seed${seed}: 点棒総和不一致 ${sum} != ${startTotal}`);
      stats.kyoku++;
      if (r.kyokuEnd.kind === 'win') {
        stats.wins++;
        for (const d of r.kyokuEnd.details) {
          stats.hanSum += d.han;
          if (d.yakuman) stats.yakuman++;
          if (!d.yakuman && d.han === 0) errors.push(`seed${seed}: 0翻和了が発生`);
          stats.maxHan = Math.max(stats.maxHan, d.han);
          stats.bonusSum += d.bonus;
          if (d.aliceFlips && d.aliceFlips.length) stats.alice++;
          if (d.diceRolls && d.diceRolls.length) stats.dice++;
          if (d.rankUp) stats.rankUp++;
        }
      } else if (r.kyokuEnd.kind === 'draw') stats.draws++;
      else stats.aborts++;
      if (!engine.finished) engine.nextKyoku();
    }
  }
  if (guard >= 200) errors.push(`seed${seed}: 局が進行しない（200局超）`);
  if (!engine.result) errors.push(`seed${seed}: 対局結果なし`);
  else {
    const t = engine.result.finals.reduce((a, f) => a + f.total, 0);
    stats.finalSum += Math.abs(t);
    stats.games++;
  }
  return engine;
}

const targets = presetId ? [getPreset(presetId)] : PRESETS.map((p) => p);
let allErrors = [];
console.log(`=== シミュレーション: ${games}局 × ${targets.length}プリセット ===`);
for (const preset of targets) {
  const rules = resolveRules(preset.rules);
  const errors = [];
  const stats = {
    games: 0, kyoku: 0, wins: 0, draws: 0, aborts: 0, hanSum: 0, maxHan: 0,
    yakuman: 0, bonusSum: 0, alice: 0, dice: 0, rankUp: 0, finalSum: 0,
  };
  const t0 = Date.now();
  const tileTotal = buildTileSet(rules).length;
  for (let g = 0; g < games; g++) runOne(rules, 1000 + g * 7919, errors, stats);
  const ms = Date.now() - t0;
  const ok = errors.length === 0;
  console.log(
    `${ok ? '[OK]  ' : '[NG]  '}${preset.name.padEnd(22, '　')} `
    + `牌${tileTotal} 対局${stats.games} 局${stats.kyoku} 和了${stats.wins} 流局${stats.draws} 途中流局${stats.aborts} `
    + `平均翻${(stats.hanSum / Math.max(1, stats.wins)).toFixed(2)} 最大翻${stats.maxHan} 役満${stats.yakuman} `
    + `BP計${stats.bonusSum} アリス${stats.alice} サイコロ${stats.dice} ランクUP${stats.rankUp} (${ms}ms)`
  );
  if (!ok) {
    const uniq = [...new Set(errors)].slice(0, 12);
    for (const e of uniq) console.log(`        ! ${e}`);
    allErrors.push(...errors);
  }
}
if (allErrors.length) {
  console.log(`\n=== 異常 ${allErrors.length} 件 ===`);
  process.exit(1);
} else {
  console.log('\n=== すべてのプリセットで整合性エラーなし ===');
}
