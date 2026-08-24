/**
 * run-tests.js - 単体テスト（役・点数・進行・ハウスルール）
 * 使い方: node test/run-tests.js
 */
import { codeToType, typeToCode, T, tileFaceKey } from '../src/core/tiles.js';
import { shanten, waits, countsFromTiles, isChiitoi, isKokushi, isChiiseimukou, makeHandOpts } from '../src/core/hand.js';
import { evaluate, countDora } from '../src/core/yaku.js';
import { basePoints, settleWin, settleNoten, finalScores } from '../src/core/score.js';
import { GameEngine } from '../src/core/engine.js';
import { decide } from '../src/core/ai.js';
import { resolveRules, DEFAULT_RULES } from '../src/rules/defaults.js';
import { getPreset, ALL_PRESETS } from '../src/rules/presets.js';
import { validateRules } from '../src/rules/validator.js';
import { explainRules, diffFromBaseline, shortSummary } from '../src/rules/explain.js';
import { runFlipBonus, rollDiceBonus, applySpecialTiles, applyFlowerEffects } from '../src/core/effects.js';
import { makeRng, buildTileSet } from '../src/core/wall.js';
import { normalize, matchText, storeHaystack, presetHaystack } from '../web/js/search.js';

// ---------------------------------------------------------------------------
let pass = 0, fail = 0;
const failures = [];
let group = '';
const describe = (name) => { group = name; console.log(`\n--- ${name} ---`); };
function it(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  [OK] ${name}`);
  } catch (e) {
    fail++;
    failures.push(`${group} / ${name}: ${e.message}`);
    console.log(`  [NG] ${name}\n       ${e.message}`);
  }
}
function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} 期待=${b} 実際=${a}`);
}
function ok(v, msg = '') { if (!v) throw new Error(`${msg} 真であるべき`); }
function no(v, msg = '') { if (v) throw new Error(`${msg} 偽であるべき`); }

let idc = 10000;
/** "2m 3m 4m r5p" 形式から牌配列を作る（r=赤, g=金, d=白ポッチ, s:id=特殊牌） */
function mk(str) {
  return str.trim().split(/\s+/).filter(Boolean).map((tok) => {
    let red = false, gold = false, dot = false, blue = false, star = false, rainbow = false;
    let sp = null, code = tok;
    const m = /^([rgdbtn]|s:[a-zA-Z0-9_]+:)?(.+)$/.exec(tok);
    if (m && m[1]) {
      if (m[1] === 'r') red = true;
      else if (m[1] === 'g') gold = true;
      else if (m[1] === 'd') dot = true;
      else if (m[1] === 'b') blue = true;
      else if (m[1] === 't') star = true;
      else if (m[1] === 'n') rainbow = true;
      else sp = m[1].slice(2, -1);
      code = m[2];
    }
    return { id: idc++, t: codeToType(code), red, gold, dot, blue, star, rainbow, sp };
  });
}

const R4 = resolveRules({});
const baseCtx = (over = {}) => ({
  hand: [], melds: [], winTile: null, tsumo: false, seatWind: 0, roundWind: 0,
  flags: { riichi: false, doubleRiichi: false, openRiichi: false, ippatsu: false, rinshan: false, chankan: false, haitei: false, houtei: false, tenhou: false, chiihou: false },
  rules: R4, doraTypes: [], kitaCount: 0, flowerDoraCount: 0, ...over,
});
const yakuNames = (res) => res.yaku.map((y) => y.name);

// ===========================================================================
describe('役判定');

it('立直・平和・門前清自摸和（20符3翻）', () => {
  const hand = mk('2m 3m 4m 3p 4p 5p 6p 7p 8p 2s 3s 4s 2p 2p');
  const res = evaluate(baseCtx({ hand, winTile: hand[2], tsumo: true, flags: { ...baseCtx().flags, riichi: true } }));
  const names = yakuNames(res);
  ok(names.includes('立直'), '立直');
  ok(names.includes('平和'), '平和');
  ok(names.includes('門前清自摸和'), 'ツモ');
  ok(names.includes('断幺九'), 'この手は断幺九も付く');
  eq(res.fu, 20, '符');
  eq(res.han, 4, '翻（立直1+平和1+ツモ1+断幺九1）');
});

it('ロンでシャンポンを埋めた四暗刻形は対々和＋三暗刻になる', () => {
  const hand = mk('2m 2m 2m 5p 5p 5p 8s 8s 8s 3z 3z 1p 1p 1p');
  const ron = evaluate(baseCtx({ hand, winTile: hand[0], tsumo: false }));
  no(ron.isYakuman, 'ロンでは四暗刻にならない');
  const names = yakuNames(ron);
  ok(names.includes('対々和'), '対々和');
  ok(names.includes('三暗刻'), '三暗刻');
  const tsumo = evaluate(baseCtx({ hand, winTile: hand[0], tsumo: true }));
  ok(tsumo.isYakuman, 'ツモなら四暗刻');
});

it('断幺九（門前）と喰いタンOFFでの不成立', () => {
  const hand = mk('2m 3m 4m 3p 4p 5p 6p 7p 8p 2s 3s 4s 2p 2p');
  const on = evaluate(baseCtx({ hand, winTile: hand[0], tsumo: false }));
  ok(yakuNames(on).includes('断幺九'), '門前タンヤオ');
  const rulesNoKuitan = resolveRules({ win: { kuitan: false } });
  const melds = [{ kind: 'pon', tiles: mk('2s 2s 2s'), concealed: false, from: 1 }];
  const hand2 = mk('2m 3m 4m 3p 4p 5p 6p 7p 8p 2p 2p');
  const off = evaluate(baseCtx({ hand: hand2, melds, winTile: hand2[0], rules: rulesNoKuitan }));
  no(yakuNames(off).includes('断幺九'), '鳴きタンヤオは不成立');
});

it('七対子・混一色・清一色・国士無双・四暗刻・大三元', () => {
  const chiitoi = mk('1m 1m 3m 3m 5m 5m 7m 7m 9m 9m 1p 1p 3s 3s');
  ok(isChiitoi(countsFromTiles(chiitoi)), 'isChiitoi');
  const r1 = evaluate(baseCtx({ hand: chiitoi, winTile: chiitoi[13] }));
  ok(yakuNames(r1).includes('七対子'), '七対子');
  eq(r1.fu, 25, '七対子25符');

  const honitsu = mk('1m 1m 1m 3m 4m 5m 7m 8m 9m 1z 1z 1z 5z 5z');
  const r2 = evaluate(baseCtx({ hand: honitsu, winTile: honitsu[0] }));
  ok(yakuNames(r2).includes('混一色'), '混一色');

  const chinitsu = mk('1m 1m 1m 2m 3m 4m 5m 6m 7m 8m 9m 9m 9m 5m');
  const r3 = evaluate(baseCtx({ hand: chinitsu, winTile: chinitsu[13] }));
  ok(yakuNames(r3).includes('清一色') || r3.isYakuman, '清一色または九蓮');

  const kokushi = mk('1m 9m 1p 9p 1s 9s 1z 2z 3z 4z 5z 6z 7z 1m');
  ok(isKokushi(countsFromTiles(kokushi)), 'isKokushi');
  const r4 = evaluate(baseCtx({ hand: kokushi, winTile: kokushi[13] }));
  ok(r4.isYakuman, '国士は役満');

  const suuankou = mk('2m 2m 2m 5p 5p 5p 8s 8s 8s 3z 3z 3z 1p 1p');
  const r5 = evaluate(baseCtx({ hand: suuankou, winTile: suuankou[0], tsumo: true }));
  ok(r5.isYakuman, '四暗刻は役満');

  const daisangen = mk('5z 5z 5z 6z 6z 6z 7z 7z 7z 2m 3m 4m 9s 9s');
  const r6 = evaluate(baseCtx({ hand: daisangen, winTile: daisangen[0] }));
  ok(r6.isYakuman && r6.yaku.some((y) => y.name === '大三元'), '大三元');
});

it('一気通貫・三色同順・対々和・混全帯幺九', () => {
  const ittsu = mk('1m 2m 3m 4m 5m 6m 7m 8m 9m 2p 3p 4p 5s 5s');
  ok(yakuNames(evaluate(baseCtx({ hand: ittsu, winTile: ittsu[0] }))).includes('一気通貫'), '一通');
  const sanshoku = mk('2m 3m 4m 2p 3p 4p 2s 3s 4s 7m 8m 9m 1z 1z');
  ok(yakuNames(evaluate(baseCtx({ hand: sanshoku, winTile: sanshoku[0] }))).includes('三色同順'), '三色');
  const toitoi = mk('2m 2m 2m 5p 5p 5p 8s 8s 8s 3z 3z 1p 1p 1p');
  ok(yakuNames(evaluate(baseCtx({ hand: toitoi, winTile: toitoi[11] }))).includes('対々和'), '対々和');
  const chanta = mk('1m 2m 3m 7p 8p 9p 1s 2s 3s 1z 1z 1z 9s 9s');
  const names = yakuNames(evaluate(baseCtx({ hand: chanta, winTile: chanta[0] })));
  ok(names.includes('混全帯幺九'), 'チャンタ');
});

it('ドラ・赤・金・北抜きが翻に加算される', () => {
  const hand = mk('2m 3m 4m 3p 4p r5p 6p 7p 8p 2s 3s 4s 2p 2p');
  const res = evaluate(baseCtx({
    hand, winTile: hand[0], tsumo: false,
    doraTypes: [codeToType('2p'), codeToType('2p')], // 2pが2枚ドラ
    kitaCount: 2,
    rules: resolveRules({ sanma: { kitaIsDora: true } }),
  }));
  eq(res.doraDetail.aka, 1, '赤1');
  eq(res.doraDetail.dora, 4, '2p×2枚 × ドラ2種');
  eq(res.doraDetail.kita, 2, '北2');
});

// ===========================================================================
describe('点数計算');

it('基本点と支払い（子30符4翻ロン=7700 / 親=11600）', () => {
  const b = basePoints({ han: 4, fu: 30, yakuman: 0 }, R4);
  eq(b.base, 1920, '基本点');
  const child = settleWin({ base: b.base, winner: 1, loser: 2, tsumo: false, dealerSeat: 0, playerCount: 4, rules: R4, honba: 0, kyotaku: 0, wareme: null });
  eq(child.deltas[1], 7700, '子ロン');
  const dealer = settleWin({ base: b.base, winner: 0, loser: 2, tsumo: false, dealerSeat: 0, playerCount: 4, rules: R4, honba: 0, kyotaku: 0, wareme: null });
  eq(dealer.deltas[0], 11600, '親ロン');
});

it('満貫ツモの分配（子2000/4000・親4000オール）', () => {
  const b = basePoints({ han: 5, fu: 30, yakuman: 0 }, R4);
  eq(b.base, 2000, '満貫');
  const child = settleWin({ base: 2000, winner: 1, loser: null, tsumo: true, dealerSeat: 0, playerCount: 4, rules: R4, honba: 0, kyotaku: 0, wareme: null });
  eq(child.deltas[1], 8000, '子ツモ計');
  eq(child.deltas[0], -4000, '親の支払い');
  eq(child.deltas[2], -2000, '子の支払い');
  const dealer = settleWin({ base: 2000, winner: 0, loser: null, tsumo: true, dealerSeat: 0, playerCount: 4, rules: R4, honba: 0, kyotaku: 0, wareme: null });
  eq(dealer.deltas[0], 12000, '親ツモ計');
});

it('切り上げ満貫・数え役満・役満・打点ランクアップ', () => {
  const up = resolveRules({ scoring: { roundUpMangan: true } });
  eq(basePoints({ han: 4, fu: 30, yakuman: 0 }, up).base, 2000, '切り上げ満貫');
  eq(basePoints({ han: 13, fu: 30, yakuman: 0 }, R4).base, 8000, '数え役満');
  eq(basePoints({ han: 13, fu: 30, yakuman: 0 }, resolveRules({ scoring: { countedYakuman: false } })).base, 6000, '数え役満なし');
  eq(basePoints({ han: 0, fu: 0, yakuman: 1 }, R4).base, 8000, '役満');
  eq(basePoints({ han: 0, fu: 0, yakuman: 2 }, R4).base, 16000, 'ダブル役満');
  // 夏の打点ランクアップ：満貫→跳満
  eq(basePoints({ han: 5, fu: 30, yakuman: 0 }, R4, 1).base, 3000, '1ランクアップ');
  eq(basePoints({ han: 5, fu: 30, yakuman: 0 }, R4, 2).base, 4000, '2ランクアップ');
  eq(basePoints({ han: 2, fu: 30, yakuman: 0 }, R4, 1).base, 2000, '満貫未満から1ランクアップ');
});

it('本場・供託・ノーテン罰符', () => {
  const s = settleWin({ base: 1000, winner: 1, loser: 2, tsumo: false, dealerSeat: 0, playerCount: 4, rules: R4, honba: 2, kyotaku: 1, wareme: null });
  eq(s.deltas[1], 4000 + 600 + 1000, '本場600＋供託1000');
  const noten = settleNoten([0, 1], 4, R4);
  eq(noten, [1500, 1500, -1500, -1500], 'ノーテン罰符2人テンパイ');
  eq(settleNoten([0], 4, R4), [3000, -1000, -1000, -1000], '1人テンパイ');
});

it('順位点（ウマ・オカ）の合計がゼロになる', () => {
  const f = finalScores([32000, 28000, 25000, 15000], R4);
  const sum = f.reduce((a, x) => a + x.total, 0);
  ok(Math.abs(sum) < 0.001, `合計0 実際=${sum}`);
  eq(f[0].rank, 1, '1位');
});

// ===========================================================================
describe('フリテン・リーチ');

function mkEngine(patch = {}, opts = {}) {
  const rules = resolveRules(patch);
  const players = [];
  for (let i = 0; i < rules.game.players; i++) players.push({ name: `P${i}`, isCpu: i !== 0 });
  const e = new GameEngine({ rules, seed: opts.seed || 777, players, debug: opts.debug || {} });
  e.startKyoku();
  return e;
}

it('自分の捨て牌に待ちがあるとロンできない（フリテン）', () => {
  const e = mkEngine();
  const p = e.players[1];
  p.hand = mk('2m 3m 4m 3p 4p 5p 6p 7p 8p 2s 3s 2p 2p');
  p.melds = [];
  p.discards = mk('1s'); // 1s-4s待ちのうち1sを捨てている
  e.updateFuriten(p);
  ok(p.waits.includes(codeToType('1s')), '待ちに1sを含む');
  ok(p.furiten, 'フリテン成立');
  const cands = e.collectRonCandidates(0, mk('4s')[0], {});
  no(cands.some((c) => c.seat === 1), 'フリテン中はロン候補に出ない');
  p.discards = mk('9z'.replace('9z', '7z'));
  e.updateFuriten(p);
  no(p.furiten, 'フリテン解除');
  const cands2 = e.collectRonCandidates(0, mk('4s')[0], {});
  ok(cands2.some((c) => c.seat === 1), 'ロン可能');
});

it('リーチ宣言で1000点供託・以降はツモ切りのみ', () => {
  const e = mkEngine();
  const p = e.players[0];
  p.hand = mk('2m 3m 4m 3p 4p 5p 6p 7p 8p 2s 3s 2p 2p');
  p.drawn = mk('4s')[0];
  p.hand.push(p.drawn);
  e.pending = { kind: 'turn', seat: 0 };
  const choices = e.getChoices(0);
  const riichi = choices.find((c) => c.type === 'riichi');
  ok(riichi, 'リーチ選択肢あり');
  const before = p.points;
  e.act(0, { type: 'riichi', tileId: riichi.tileIds[0] });
  eq(p.points, before - 1000, 'リーチ棒');
  eq(e.round.kyotaku, 1, '供託1本');
  ok(p.riichi, 'リーチ状態');
  ok(p.ippatsu, '一発フラグ');
  // 次巡はツモ切り固定
  p.drawn = mk('9m')[0];
  p.hand.push(p.drawn);
  e.pending = { kind: 'turn', seat: 0 };
  const c2 = e.getChoices(0).find((c) => c.type === 'discard');
  eq(c2.tileIds, [p.drawn.id], 'ツモ切りのみ');
});

it('ダブル立直と一発の判定', () => {
  const e = mkEngine();
  const p = e.players[0];
  p.hand = mk('2m 3m 4m 3p 4p 5p 6p 7p 8p 2s 3s 2p 2p 4s');
  p.drawn = p.hand[13];
  e.pending = { kind: 'turn', seat: 0 };
  e.firstGoAround = true;
  const riichi = e.getChoices(0).find((c) => c.type === 'riichi');
  e.act(0, { type: 'riichi', tileId: p.hand.find((t) => t.t === codeToType('4s')).id });
  ok(p.doubleRiichi, 'ダブルリーチ');
});

// ===========================================================================
describe('鳴き');

it('ポンで手牌と副露が正しく更新される', () => {
  const e = mkEngine();
  const p = e.players[1];
  p.hand = mk('2s 2s 3m 4m 5m 6p 7p 8p 1z 1z 9m 9m 9m');
  const tile = mk('2s')[0];
  e.players[0].discards.push(tile);
  const r = e.applyCall(1, { type: 'pon', tileIds: p.hand.filter((t) => t.t === codeToType('2s')).map((t) => t.id) }, 0, tile);
  eq(p.melds.length, 1, '副露1');
  eq(p.melds[0].tiles.length, 3, '3枚');
  eq(p.hand.length, 11, '手牌11枚');
  no(e.isMenzen(p), '門前でない');
});

it('三麻ではチーの選択肢が出ない', () => {
  const e3 = mkEngine({ game: { players: 3 } });
  no(e3.rules.win.chi, 'チー無効');
  const p = e3.players[1];
  p.hand = mk('3p 4p 6p 7p 8p 1s 2s 3s 9s 9s 1z 1z 1z');
  const tile = mk('5p')[0];
  e3.players[0].discards.push(tile);
  const r = e3.afterDiscard(0, tile);
  const cand = (e3.pending && e3.pending.kind === 'claim') ? e3.pending.candidates.find((c) => c.seat === 1) : null;
  if (cand) no(cand.options.some((o) => o.type === 'chi'), 'チーが出ない');
});

it('食い替えが禁止される', () => {
  const e = mkEngine({ win: { kuikae: false } });
  const p = e.players[1];
  p.hand = mk('3m 4m 6p 7p 8p 1s 2s 3s 9s 9s 1z');
  const tile = mk('2m')[0];
  p.melds = [{ kind: 'chi', tiles: mk('2m 3m 4m'), concealed: false, from: 0, calledTile: tile }];
  p.lastCall = { kind: 'chi', tiles: mk('2m 3m 4m'), calledTile: tile };
  p.lastCallDiscarded = false;
  p.drawn = null;
  e.pending = { kind: 'turn', seat: 1 };
  const d = e.getChoices(1).find((c) => c.type === 'discard');
  const banned = p.hand.filter((t) => t.t === codeToType('2m')).map((t) => t.id);
  no(d.tileIds.some((id) => banned.includes(id)), '喰い替え牌は打てない');
});

// ===========================================================================
describe('流局・親連荘');

it('流局でテンパイ者に罰符が入り、親テンパイで連荘する', () => {
  const e = mkEngine({ renchan: { dealerRepeat: 'tenpai' } });
  e.players[0].hand = mk('2m 3m 4m 3p 4p 5p 6p 7p 8p 2s 3s 2p 2p'); // テンパイ
  e.players[1].hand = mk('1m 3m 5m 7m 9m 1p 3p 5p 7p 9p 1s 3s 5s'); // ノーテン
  e.players[2].hand = mk('1m 3m 5m 7m 9m 1p 3p 5p 7p 9p 1s 3s 6s');
  e.players[3].hand = mk('1m 3m 5m 7m 9m 1p 3p 5p 7p 9p 1s 3s 7s');
  for (const p of e.players) { p.melds = []; p.discards = mk('1z'); p.nagashi = false; }
  e.wall.drawIndex = e.wall.liveEnd; // 山を尽きた状態に
  e.endKyokuByDraw();
  const res = e.kyokuEnd;
  eq(res.kind, 'draw', '流局');
  eq(res.tenpai, [0], '親のみテンパイ');
  eq(res.deltas[0], 3000, '罰符受け取り');
  ok(res.dealerKeeps, '親継続');
});

it('和了連荘：子の和了で親が流れる', () => {
  const e = mkEngine({ renchan: { dealerRepeat: 'agari' } });
  const p = e.players[1];
  p.hand = mk('2m 3m 4m 3p 4p 5p 6p 7p 8p 2s 3s 4s 2p 2p');
  p.melds = [];
  p.drawn = p.hand[0];
  const win = e.checkWin(1, p.drawn, true);
  ok(win, '和了成立');
  e.applyWin(1, win, null, true);
  no(e.kyokuEnd.dealerKeeps, '親流れ');
  const beforeDealer = e.round.dealer;
  e.nextKyoku();
  eq(e.round.dealer, (beforeDealer + 1) % 4, '親が移る');
  eq(e.round.honba, 0, '本場リセット');
});

// ===========================================================================
describe('三麻 / 四麻の差分');

it('使用牌数：四麻136枚 / 三麻（萬子2〜8抜き）108枚', () => {
  const e4 = mkEngine();
  eq(e4.wall.all.length, 136, '四麻');
  const e3 = mkEngine({ game: { players: 3 } });
  eq(e3.wall.all.length, 108, '三麻');
  const e3m = mkEngine({ game: { players: 3 }, sanma: { removeManzu: false } });
  eq(e3m.wall.all.length, 136, '萬子あり三麻');
});

it('ツモ損あり／なし（丸取り）で受け取りが変わる', () => {
  const loss = resolveRules({ game: { players: 3 }, sanma: { tsumoLoss: true } });
  const noLoss = resolveRules({ game: { players: 3 }, sanma: { tsumoLoss: false } });
  const a = settleWin({ base: 2000, winner: 1, loser: null, tsumo: true, dealerSeat: 0, playerCount: 3, rules: loss, honba: 0, kyotaku: 0, wareme: null });
  eq(a.deltas[1], 6000, 'ツモ損あり=親4000+子2000');
  const b = settleWin({ base: 2000, winner: 1, loser: null, tsumo: true, dealerSeat: 0, playerCount: 3, rules: noLoss, honba: 0, kyotaku: 0, wareme: null });
  ok(b.deltas[1] >= 8000, `丸取りは4人麻雀相当 実際=${b.deltas[1]}`);
});

it('北抜きでボーナスと抜きドラが増える', () => {
  const e = mkEngine({ game: { players: 3 } });
  const p = e.players[0];
  p.hand = mk('4z 1p 2p 3p 4p 5p 6p 7p 8p 9p 1s 2s 3s');
  p.drawn = p.hand[0];
  e.pending = { kind: 'turn', seat: 0 };
  const kita = e.getChoices(0).find((c) => c.type === 'kita');
  ok(kita, '北抜きの選択肢');
  const before = p.bonus;
  e.act(0, { type: 'kita' });
  eq(p.kita.length, 1, '北1枚');
  ok(p.bonus > before, 'BP増加');
});

// ===========================================================================
describe('特殊牌エンジン');

it('特殊牌の効果（ドラ+/翻+/BP+）が集計される', () => {
  const rules = resolveRules({
    specialTiles: [
      { id: 'blue5s', name: '青5索', tile: '5s', count: 1, color: 'blue', effects: [{ type: 'bonus', value: 2 }, { type: 'dora', value: 1 }] },
      { id: 'em5m', name: '翠5萬', tile: '5m', count: 1, color: 'green', effects: [{ type: 'han', value: 1 }], conditions: { menzenOnly: true } },
    ],
  });
  const tiles = mk('s:blue5s:5s s:em5m:5m 1p');
  const eff = applySpecialTiles(rules, { allTiles: tiles, menzen: true, tsumo: true, flags: { riichi: false, ippatsu: false } });
  eq(eff.bonus, 2, 'BP');
  eq(eff.extraDora, 1, 'ドラ+1');
  eq(eff.extraHan, 1, '翻+1');
  const effOpen = applySpecialTiles(rules, { allTiles: tiles, menzen: false, tsumo: true, flags: { riichi: false, ippatsu: false } });
  eq(effOpen.extraHan, 0, '門前限定は副露で無効');
});

it('特殊牌の組み合わせ条件（コンボ）が働く', () => {
  const rules = resolveRules({
    specialTiles: [
      { id: 'a', name: 'A', tile: '5s', count: 1, effects: [{ type: 'bonus', value: 5 }], conditions: { combo: ['b'] } },
      { id: 'b', name: 'B', tile: '5p', count: 1, effects: [{ type: 'bonus', value: 1 }] },
    ],
  });
  const alone = applySpecialTiles(rules, { allTiles: mk('s:a:5s'), menzen: true, tsumo: true, flags: {} });
  eq(alone.bonus, 0, '片方だけでは無効');
  const both = applySpecialTiles(rules, { allTiles: mk('s:a:5s s:b:5p'), menzen: true, tsumo: true, flags: {} });
  eq(both.bonus, 6, '両方で成立');
});

it('店舗プリセットの特殊牌が実際に山へ入る', () => {
  const e = mkEngine(getPreset('store_tokushu_kan').rules);
  const sps = e.wall.all.filter((t) => t.sp);
  ok(sps.length >= 5, `特殊牌が山にある 実際=${sps.length}`);
  const ids = new Set(sps.map((t) => t.sp));
  ok(ids.has('blue5s') && ids.has('topaz_haku'), '定義通りのIDが入っている');
});

// ===========================================================================
describe('白ポッチ');

it('白ポッチがオールマイティとして和了に使える（リーチツモ限定）', () => {
  const rules = { local: { shiroPocchi: { enabled: true, count: 1, mode: 'both', almightyCondition: 'riichi_tsumo', bonus: 2 } } };
  const e = mkEngine(rules);
  const p = e.players[0];
  const dot = mk('d5z')[0];
  p.hand = [...mk('2m 3m 4m 3p 4p 5p 6p 7p 8p 2s 3s 4s 2p'), dot];
  p.melds = [];
  p.drawn = dot;
  eq(shanten(countsFromTiles(p.hand), 0), 0, '素の形は1枚足りない');
  p.riichi = false;
  no(e.checkWin(0, dot, true), 'リーチしていなければ和了不可');
  p.riichi = true;
  const win = e.checkWin(0, dot, true);
  ok(win, 'リーチツモでオールマイティ和了');
  ok(win.substituted, '置き換え情報あり');
});

it('白ポッチが山に指定枚数入る', () => {
  const e = mkEngine({ local: { shiroPocchi: { enabled: true, count: 2 } } });
  eq(e.wall.all.filter((t) => t.dot).length, 2, '2枚');
});

// ===========================================================================
describe('アリス / チューリップ');

it('アリスが一致でBPを獲得し、不一致で止まる', () => {
  const e = mkEngine(getPreset('alice_demo').rules);
  const hand = mk('2m 3m 4m 3p 4p 5p 6p 7p 8p 2s 3s 4s 2p 2p');
  // めくり列の先頭を手牌にある牌、次を手牌にない牌にする
  const idx = 4 + e.wall.revealed * 2;
  e.wall.dead[idx] = mk('2p')[0];
  e.wall.dead[idx + 1] = mk('7z')[0];
  const res = runFlipBonus(e.rules.local.alice, e.wall, {
    handTiles: hand, winTile: hand[0], menzen: true, tsumo: true, flags: { riichi: true },
  }, 'アリス');
  eq(res.aliceFlips.length, 2, '2枚めくって止まる');
  ok(res.aliceFlips[0].matched, '1枚目一致');
  no(res.aliceFlips[1].matched, '2枚目不一致');
  eq(res.bonus, 2, '刻子扱い=手牌の枚数分（2pが2枚）');
});

it('門前条件・リーチ条件が効く', () => {
  const e = mkEngine(getPreset('alice_demo').rules);
  const hand = mk('2m 3m 4m 3p 4p 5p 6p 7p 8p 2s 3s 4s 2p 2p');
  const res = runFlipBonus(e.rules.local.alice, e.wall, {
    handTiles: hand, winTile: hand[0], menzen: false, tsumo: true, flags: {},
  }, 'アリス');
  eq(res.bonus, 0, '副露時は不成立');
  const cfg = { ...e.rules.local.alice, requireRiichi: true };
  const res2 = runFlipBonus(cfg, e.wall, {
    handTiles: hand, winTile: hand[0], menzen: true, tsumo: true, flags: { riichi: false },
  }, 'アリス');
  eq(res2.bonus, 0, 'リーチ必須設定でリーチなしは不成立');
});

it('チューリップは現物の両隣も一致扱いになる', () => {
  const e = mkEngine(getPreset('tulip_demo').rules);
  const hand = mk('1m 2m 3m 1s 2s 3s 4z 4z 5z 5z 6z 6z 9p 9p');
  const idx = 4 + e.wall.revealed * 2;
  e.wall.dead[idx] = mk('8p')[0];   // 9pの隣（手牌に8pは無い）
  e.wall.dead[idx + 1] = mk('7z')[0];
  const res = runFlipBonus(e.rules.local.tulip, e.wall, {
    handTiles: hand, winTile: hand[0], menzen: true, tsumo: true, flags: {},
  }, 'チューリップ');
  ok(res.bonus > 0, '両隣で一致');
  const exact = runFlipBonus({ ...e.rules.local.tulip, matchMode: 'exact' }, e.wall, {
    handTiles: hand, winTile: hand[0], menzen: true, tsumo: true, flags: {},
  }, 'アリス');
  eq(exact.bonus, 0, '現物一致のみでは不成立');
});

// ===========================================================================
describe('オープンリーチ・割れ目');

it('オープンリーチで翻が加算される', () => {
  const rules = resolveRules({ local: { openRiichi: { enabled: true, han: 2, bonus: 2 } } });
  const hand = mk('2m 3m 4m 3p 4p 5p 6p 7p 8p 2s 3s 4s 2p 2p');
  const res = evaluate(baseCtx({
    hand, winTile: hand[2], tsumo: true, rules,
    flags: { ...baseCtx().flags, riichi: true, openRiichi: true },
  }));
  ok(yakuNames(res).includes('オープン立直'), 'オープン立直');
  eq(res.han, 6, '立直1+オープン2+平和1+ツモ1+断幺九1');
});

it('割れ目の支払いが2倍になる', () => {
  const rules = resolveRules({ local: { wareme: { enabled: true, multiplier: 2 } } });
  const normal = settleWin({ base: 1000, winner: 1, loser: 2, tsumo: false, dealerSeat: 0, playerCount: 4, rules, honba: 0, kyotaku: 0, wareme: null });
  const wareme = settleWin({ base: 1000, winner: 1, loser: 2, tsumo: false, dealerSeat: 0, playerCount: 4, rules, honba: 0, kyotaku: 0, wareme: 2 });
  eq(normal.deltas[1], 4000, '通常');
  eq(wareme.deltas[1], 8000, '割れ目2倍');
  eq(wareme.deltas[2], -8000, '割れ目の支払い');
  const wr = settleWin({ base: 1000, winner: 2, loser: 1, tsumo: false, dealerSeat: 0, playerCount: 4, rules, honba: 0, kyotaku: 0, wareme: 2 });
  eq(wr.deltas[2], 8000, '割れ目の受け取りも2倍');
});

it('局開始時に割れ目が決まる', () => {
  const e = mkEngine({ local: { wareme: { enabled: true } } });
  ok(e.wareme !== null && e.wareme >= 0 && e.wareme < 4, '割れ目が決定している');
});

// ===========================================================================
describe('五等サンマ系');

it('五等サンマ館プリセットの主要設定が反映される', () => {
  const e = mkEngine(getPreset('store_goto_kan').rules);
  eq(e.rules.game.players, 3, '三麻');
  eq(e.rules.scoring.startingPoints, 35000, '35000持ち');
  eq(e.rules.scoring.returnPoints, 40000, '40000返し');
  eq(e.rules.dora.indicators, 2, '常時ドラ2枚');
  eq(e.wall.doraIndicators.length, 2, '表ドラ2枚公開');
  ok(e.rules.flowers.enabled, '華牌あり');
  ok(e.rules.local.shiroPocchi.enabled, '白ポッチあり');
  ok(e.rules.local.dice.enabled, 'サイコロチャンスあり');
  eq(e.wall.all.filter((t) => t.t >= 34).length, 4, '華牌4枚');
  eq(e.wall.all.filter((t) => t.gold).length, 3, '金牌3枚（5筒2・5索1。5索の残り1枚は青5索）');
  eq(e.wall.all.filter((t) => t.t === codeToType('5s')).filter((t) => t.red || t.gold || t.sp).length, 4,
    '5索は4枚すべてに属性が付く（赤2・金1・青1）');
  ok(e.wall.all.some((t) => t.sp === 'blue5s'), '青5索');
  ok(/非換金/.test(e.rules.bonus.label), 'ポイントは非換金表記');
});

it('華牌の効果（春=即時BP / 夏=ランクアップ / 秋=5ダブドラ / 冬=アリス）', () => {
  const rules = resolveRules(getPreset('store_goto_kan').rules);
  const spring = applyFlowerEffects(rules, mk('1f'), 3, 'draw');
  eq(spring.bonus, 2, '春はオール（人数-1）');
  const summer = applyFlowerEffects(rules, mk('2f'), 3, 'win');
  eq(summer.rankUp, 1, '夏で1ランクアップ');
  const autumn = applyFlowerEffects(rules, mk('3f'), 3, 'win');
  ok(autumn.doubleFives, '秋で5ダブドラ');
  const winter = applyFlowerEffects(rules, mk('4f'), 3, 'win');
  eq(winter.aliceTrigger, 2, '冬でアリス発動');
  // 二重計上しないこと
  eq(applyFlowerEffects(rules, mk('1f'), 3, 'win').bonus, 0, '春は和了時に再計上されない');
});

it('華牌を引くと自動で抜かれて補充される', () => {
  const e = mkEngine(getPreset('store_goto_kan').rules);
  const p = e.players[0];
  const before = p.hand.length;
  const beforeFlowers = p.flowers.length; // 配牌時に既に抜けている場合がある
  const flower = mk('1f')[0];
  p.hand.push(flower);
  e.resolveFlowersInHand(p, false);
  eq(p.flowers.length, beforeFlowers + 1, '抜いた華牌が1枚増える');
  eq(p.hand.length, before + 1, '補充されて枚数維持');
  no(p.hand.some((t) => t.t >= 34), '手牌に華牌が残らない');
});

it('サイコロチャンスが条件で発動しBPを生む', () => {
  const rules = resolveRules(getPreset('goto_dice').rules);
  const rng = makeRng(12345);
  const none = rollDiceBonus(rules.local.dice, rng, ['nothing']);
  eq(none.bonus, 0, 'トリガー外では発動しない');
  const fired = rollDiceBonus(rules.local.dice, rng, ['yakuman']);
  ok(fired.bonus > 0, `発動でBP獲得 実際=${fired.bonus}`);
  ok(fired.bonus <= rules.local.dice.cap, '上限を超えない');
  ok(fired.diceRolls.length >= 1 && fired.diceRolls[0].length === 3, 'サイコロ3個');
});

it('五等サンマの完全順位制・沈みウマが効く', () => {
  const rules = resolveRules(getPreset('goto_standard').rules);
  const f = finalScores([60000, 35000, 10000], rules);
  eq(f[1].uma, -10, '2着が返し点未満で沈みウマ');
  eq(f[2].uma, -30, '3着は-20-10');
  eq(f[0].uma, 40, 'トップは合計の裏返し');
  const g = finalScores([60000, 45000, 0], rules);
  eq(g[1].uma, 0, '2着が返し点以上なら±0');
});

// ===========================================================================
describe('ルール検証（Validator）');

it('全プリセットがエラーなしで検証を通る', () => {
  for (const p of ALL_PRESETS) {
    const v = validateRules(resolveRules(p.rules));
    ok(v.ok, `${p.name} にエラー: ${v.issues.filter((i) => i.severity === 'error').map((i) => i.message).join(' / ')}`);
  }
});

it('矛盾した設定を検出する', () => {
  const v1 = validateRules(resolveRules({ game: { players: 3 }, dora: { red: { '5m': 1, '5p': 1 } } }));
  ok(v1.issues.some((i) => /自動調整/.test(i.message) && /5m/.test(i.message)), '抜いた萬子の赤牌を自動無効化して通知');
  const v1b = validateRules(resolveRules({
    game: { players: 3 },
    specialTiles: [{ id: 'x', name: '特殊5萬', tile: '5m', count: 1, effects: [{ type: 'bonus', value: 1 }] }],
  }));
  ok(v1b.issues.some((i) => i.severity === 'error' && /5m/.test(i.message)), '存在しない牌への特殊牌指定はエラー');
  no(v1b.ok, 'エラーがある場合 ok=false');

  const v2 = validateRules(resolveRules({ game: { players: 3 }, sanma: { northMode: 'nuki', northIsYakuhai: true } }));
  ok(v2.issues.some((i) => /抜きドラ.*役牌/.test(i.message)), '北の二重設定を警告');
  ok(v2.ok, '警告のみで通せる');

  const v3 = validateRules(resolveRules({ dora: { red: { '5p': 3 }, gold: { '5p': 3 } } }));
  ok(v3.issues.some((i) => i.severity === 'error' && /4枚を超え/.test(i.message)), '同一牌への属性過剰をエラー');

  const v4 = validateRules(resolveRules({
    game: { players: 3 }, scoring: { startingPoints: 35000 }, dora: { indicators: 2 }, flowers: { enabled: false },
  }));
  ok(v4.issues.some((i) => /華牌が無効/.test(i.message)), '五等系なのに華牌無効を警告');

  const v5 = validateRules(resolveRules({
    customRules: [{ id: 'x', name: 'テスト', when: 'win', if: [{ fact: 'hasSpecial', id: 'nothere' }], then: [{ action: 'bonus', value: 1 }] }],
  }));
  ok(v5.issues.some((i) => i.severity === 'error' && /未定義の特殊牌/.test(i.message)), '未定義IDをエラー');

  const v6 = validateRules(resolveRules({ game: { players: 3 }, win: { chi: true } }));
  ok(v6.ok, '三麻チーは自動無効化されるので通る');
});

// ===========================================================================
describe('ルール説明の自動生成');

it('説明文が生成され、店舗固有の内容を含む', () => {
  const rules = resolveRules(getPreset('store_goto_kan').rules);
  const sections = explainRules(rules);
  const text = sections.flatMap((s) => s.lines).join('\n');
  ok(/35,000点持ち40,000点返し/.test(text), '持ち点返し点の文');
  ok(/三人麻雀/.test(text), '三麻の明記');
  ok(/白ポッチ/.test(text), '白ポッチの説明');
  ok(/冬/.test(text) && /アリス/.test(text), '冬アリスの説明');
  ok(/非換金/.test(text), '非換金の明記');
});

it('一般ルールとの差分のみを抽出できる', () => {
  const rules = resolveRules(getPreset('store_yonma_kan').rules);
  const diff = diffFromBaseline(rules);
  const labels = diff.map((d) => d.label);
  ok(labels.includes('白ポッチ'), '白ポッチが差分に出る');
  ok(labels.includes('アリス'), 'アリスが差分に出る');
  ok(labels.includes('特殊牌'), '特殊牌が差分に出る');
  no(labels.includes('喰いタン'), '一般と同じ項目は差分に出ない');
  ok(shortSummary(rules).includes('四麻'), '1行サマリ');
});

// ===========================================================================
describe('対局の完走（CPU）');

it('四麻・三麻・五等サンマが最後まで進行して結果が出る', () => {
  for (const id of ['standard4', 'standard3', 'store_goto_kan', 'store_tokushu_kan']) {
    const preset = getPreset(id);
    const rules = resolveRules(preset.rules);
    const players = [];
    for (let i = 0; i < rules.game.players; i++) players.push({ name: `CPU${i}`, isCpu: true });
    const e = new GameEngine({ rules, seed: 20260817, players });
    e.startKyoku();
    let guard = 0;
    while (!e.finished && guard++ < 100) {
      const r = e.advance(decide, 20000);
      ok(!r.error, `${preset.name}: ${r.error || ''}`);
      if (r.kyokuEnd && !e.finished) e.nextKyoku();
    }
    ok(e.finished, `${preset.name} が終局した`);
    ok(e.result && e.result.finals.length === rules.game.players, `${preset.name} の順位が出た`);
    const sum = e.players.reduce((a, p) => a + p.points, 0) + e.round.kyotaku * 1000;
    eq(sum, rules.scoring.startingPoints * rules.game.players, `${preset.name} の点棒総和`);
  }
});

it('デバッグモード：CPU手牌開示・点数指定・強制サイコロ', () => {
  const rules = resolveRules(getPreset('store_goto_kan').rules);
  const e = new GameEngine({
    rules, seed: 5, players: [{ isCpu: false }, { isCpu: true }, { isCpu: true }],
    debug: { showCpuHands: true, startPoints: [50000, 30000, 25000], forceDice: true },
  });
  e.startKyoku();
  const snap = e.snapshot(0);
  no(snap.players[1].hand.some((t) => t.hidden), 'CPU手牌が見える');
  eq(snap.players[0].points, 50000, '点数指定');
  const e2 = new GameEngine({ rules, seed: 5, players: [{ isCpu: false }], debug: { forcedWall: ['1z', '1z', '1z'] } });
  e2.startKyoku();
  ok(e2.players[0].hand.filter((t) => t.t === codeToType('1z')).length >= 1, '配牌固定が効く');
});

// ===========================================================================
describe('拡張：点数体系が異なるルール（東天紅・ロケット系）');

it('東天紅風は使用牌・場風・親の決まり方が変わる', () => {
  const e = mkEngine(getPreset('toutenkou3').rules);
  eq(e.wall.all.length, 112, '28種112枚（一五九萬＋筒索字）');
  ok(e.rules.game.alwaysEast, '常に東場');
  eq(e.rules.game.dealerRule, 'winner', '前局の和了者が親');
  ok(e.wall.all.some((t) => t.t === codeToType('5m')), '5萬が使用牌に含まれる');
  no(e.wall.all.some((t) => t.t === codeToType('4m')), '4萬は含まれない');
  // 前局の和了者が次局の親になる
  e.lastWinnerSeat = 2;
  e.nextKyokuPlan = { honba: 0, advance: true };
  e.nextKyoku();
  eq(e.round.dealer, 2, '和了者が親');
  eq(e.round.wind, 0, '場風は東のまま');
});

it('東天紅風はロンが1人分・ツモが2人分になる', () => {
  const rules = resolveRules(getPreset('toutenkou3').rules);
  const bp = basePoints({ han: 5, fu: 30, yakuman: 0 }, rules);
  ok(bp.flat, 'flatモード');
  eq(bp.pointsPerPayer, 8, '満貫＝8点（8000点×0.001）');
  const ron = settleWin({
    base: bp.base, pointsPerPayer: bp.pointsPerPayer, winner: 0, loser: 1, tsumo: false,
    dealerSeat: 0, playerCount: 3, rules, honba: 0, kyotaku: 0, wareme: null,
  });
  eq(ron.deltas[0], 8, 'ロンは1人分');
  eq(ron.deltas[1], -8, '放銃者だけが払う');
  eq(ron.deltas[2], 0, 'third は動かない');
  const tsumo = settleWin({
    base: bp.base, pointsPerPayer: bp.pointsPerPayer, winner: 0, loser: null, tsumo: true,
    dealerSeat: 0, playerCount: 3, rules, honba: 0, kyotaku: 0, wareme: null,
  });
  eq(tsumo.deltas[0], 16, 'ツモは2人分');
  eq(tsumo.deltas[1], -8, '各自が1人分ずつ');
  const yakuman = basePoints({ han: 0, fu: 0, yakuman: 1 }, rules);
  eq(yakuman.pointsPerPayer, 50, '役満は50点固定');
});

it('ロケット三麻風は1翻でも倍満に昇格しロケット牌でBPが入る', () => {
  const rules = resolveRules(getPreset('rocket3').rules);
  const one = basePoints({ han: 1, fu: 40, yakuman: 0 }, rules);
  eq(one.pointsPerPayer, 16, '1翻→倍満（16000点相当×0.001）');
  const three = basePoints({ han: 3, fu: 40, yakuman: 0 }, rules);
  ok(three.pointsPerPayer < one.pointsPerPayer || three.pointsPerPayer >= 6, '3翻は通常計算');
  const eff = applySpecialTiles(rules, {
    allTiles: mk('s:rocket_p:5p 1p'), menzen: true, tsumo: true, flags: { riichi: false, ippatsu: false },
  });
  eq(eff.bonus, 20, 'ロケット牌のBP');
  const e = mkEngine(getPreset('rocket3').rules);
  eq(e.wall.all.filter((t) => t.sp && t.sp.startsWith('rocket')).length, 3, 'ロケット牌3枚');
});

// ===========================================================================
describe('拡張：ドラの種類');

it('爆ドラで表ドラ表示牌が増える', () => {
  const e = mkEngine(getPreset('bakudora4').rules);
  eq(e.wall.doraIndicators.length, 3, '1枚＋爆ドラ2枚');
});

it('属性ごとにドラの枚数を変えられる（金＝2枚分・青＝1枚分）', () => {
  const rules = resolveRules({
    dora: { gold: { '5p': 1 }, blue: { '5s': 1 }, attributeDora: { red: 1, gold: 2, blue: 1, star: 1, rainbow: 3 } },
  });
  const hand = [...mk('2m 3m 4m 3p 4p 6p 7p 8p 2s 3s 4s 2p 2p'), ...mk('g5p')];
  const res = evaluate(baseCtx({ hand, winTile: hand[0], rules }));
  eq(res.doraDetail.gold, 2, '金牌はドラ2枚分');
  const hand2 = [...mk('2m 3m 4m 3p 4p 5p 6p 7p 8p 3s 4s 2p 2p'), ...mk('b5s')];
  const res2 = evaluate(baseCtx({ hand: hand2, winTile: hand2[0], rules }));
  eq(res2.doraDetail.other, 1, '青牌はドラ1枚分');
});

it('青牌・星牌・虹牌が山に入る', () => {
  const e = mkEngine({ dora: { blue: { '5s': 1 }, star: { '1p': 1 }, rainbow: { '9s': 1 } } });
  eq(e.wall.all.filter((t) => t.blue).length, 1, '青1枚');
  eq(e.wall.all.filter((t) => t.star).length, 1, '星1枚');
  eq(e.wall.all.filter((t) => t.rainbow).length, 1, '虹1枚');
});

// ===========================================================================
describe('拡張：特殊牌（アメジスト5筒の例）');

it('アメジスト5筒：リーチ時のみBP5＋オールマイティ', () => {
  const rules = resolveRules(getPreset('store_tokushu_kan').rules);
  const def = rules.specialTiles.find((d) => d.id === 'amethyst5p');
  ok(def, '定義がある');
  const tiles = mk('s:amethyst5p:5p');
  const noRiichi = applySpecialTiles(rules, {
    allTiles: tiles, menzen: true, tsumo: true, flags: { riichi: false, ippatsu: false },
  });
  eq(noRiichi.bonus, 0, 'リーチしていなければ無効');
  const riichi = applySpecialTiles(rules, {
    allTiles: tiles, menzen: true, tsumo: true, flags: { riichi: true, ippatsu: false },
  });
  eq(riichi.bonus, 5, 'リーチ時はBP5');
  // オールマイティとして和了に使える
  const e = mkEngine(getPreset('store_tokushu_kan').rules);
  const p = e.players[0];
  const am = e.wall.all.find((t) => t.sp === 'amethyst5p');
  ok(am, '山にアメジストがある');
  p.hand = [...mk('2m 3m 4m 3p 4p 5p 6p 7p 8p 2s 3s 4s 9p'), am];
  p.melds = [];
  p.drawn = am;
  p.riichi = false;
  no(e.checkWin(0, am, true), 'リーチなしでは和了できない');
  p.riichi = true;
  const win = e.checkWin(0, am, true);
  ok(win, 'リーチ後はオールマイティとして和了できる');
});

it('特殊牌はツモった瞬間に効果を出すこともできる（activationTiming: draw）', () => {
  const e = mkEngine({
    specialTiles: [{
      id: 'insta', name: '即時牌', tile: '5s', count: 1, color: 'star',
      activationTiming: 'draw', effects: [{ type: 'bonus', value: 7 }],
    }],
  });
  const p = e.players[0];
  const before = p.bonus;
  ok(e.debugForceNextDraw((t) => t.sp === 'insta'), '山に即時牌がある');
  e.drawTile(0, false);
  eq(p.bonus, before + 7, 'ツモった瞬間にBPが入る');
});

it('特殊牌でアリス・サイコロ・点数倍化を発火できる', () => {
  const rules = resolveRules({
    specialTiles: [{
      id: 'trigger', name: 'トリガー牌', tile: '5s', count: 1,
      effects: [{ type: 'alice', value: 3 }, { type: 'dice' }, { type: 'scoreMultiply', value: 2 }],
    }],
  });
  const eff = applySpecialTiles(rules, {
    allTiles: mk('s:trigger:5s'), menzen: true, tsumo: true, flags: { riichi: false, ippatsu: false },
  });
  eq(eff.aliceTrigger, 3, 'アリス発動');
  ok(eff.diceTrigger, 'サイコロ発動');
  eq(eff.scoreMultiply, 2, '点数2倍');
});

// ===========================================================================
describe('食い替え禁止は鳴いた直後の1打だけ');

it('局をまたいで持ち越さない', () => {
  // 局のはじめに捨て牌が0枚に戻るのを解除の条件にしていたため、
  // 前の局でチーしていると、次の局の第一打で特定の牌が切れなくなっていた。
  const e = mkEngine({ win: { kuikae: false } });
  const p = e.players[0];
  p.lastCall = { kind: 'chi', tiles: mk('3m 4m 5m'), calledTile: mk('3m')[0] };
  p.lastCallDiscarded = true;
  e.startKyoku();
  ok(!e.isKuikaeBanned(e.players[0], mk('3m')[0]), '新しい局では禁止されない');
});

it('鳴いた直後は禁止、1枚切ったら解ける', () => {
  const e = mkEngine({ win: { kuikae: false } });
  const p = e.players[0];
  p.lastCall = { kind: 'chi', tiles: mk('3m 4m 5m'), calledTile: mk('3m')[0] };
  p.lastCallDiscarded = false;
  ok(e.isKuikaeBanned(p, mk('3m')[0]), '鳴いた牌と同じ牌は切れない');
  p.lastCallDiscarded = true;
  ok(!e.isKuikaeBanned(p, mk('3m')[0]), '1枚切ったら切れるようになる');
});

it('河から鳴かれて捨て牌が0枚になっても、禁止は復活しない', () => {
  const e = mkEngine({ win: { kuikae: false } });
  const p = e.players[0];
  p.lastCall = { kind: 'chi', tiles: mk('3m 4m 5m'), calledTile: mk('3m')[0] };
  p.lastCallDiscarded = true;
  p.discards = [];   // 自分の捨て牌が鳴かれて0枚になった状態
  ok(!e.isKuikaeBanned(p, mk('3m')[0]), '捨て牌の枚数は関係ない');
});

// ===========================================================================
describe('役満：鳴いた牌も見る');

it('中をポンしていたら緑一色にならない', () => {
  // 門前の手牌だけを見て判定していたころ、手の中が索子の緑だけなら
  // 中をポンしていても緑一色（役満）が付いていた。
  const hand = mk('2s 2s 3s 3s 4s 4s 6s 6s 8s 8s 8s');
  const melds = [{ kind: 'pon', concealed: false, tiles: mk('7z 7z 7z') }];
  const res = evaluate(baseCtx({ hand, melds, winTile: hand[10], tsumo: true }));
  ok(res, '和了として成立する');
  ok(!yakuNames(res).includes('緑一色'), '緑一色は付かない');
});

it('鳴いた牌まで緑なら緑一色になる', () => {
  const hand = mk('2s 2s 3s 3s 4s 4s 6s 6s 8s 8s 8s');
  const melds = [{ kind: 'pon', concealed: false, tiles: mk('6z 6z 6z') }];   // 發
  const res = evaluate(baseCtx({ hand, melds, winTile: hand[10], tsumo: true }));
  ok(yakuNames(res).includes('緑一色'), '緑一色が付く');
});

it('中をポンしていたら清老頭にならない', () => {
  const hand = mk('1m 1m 1m 9m 9m 9m 1p 1p 1p 9s 9s');
  const melds = [{ kind: 'pon', concealed: false, tiles: mk('7z 7z 7z') }];
  const res = evaluate(baseCtx({ hand, melds, winTile: hand[10], tsumo: true }));
  ok(res, '和了として成立する');
  ok(!yakuNames(res).includes('清老頭'), '清老頭は付かない');
});

// ===========================================================================
describe('拡張：ローカル役');

it('大車輪・三連刻・一色三順・五門斉が採用設定で成立する', () => {
  const rules = resolveRules(getPreset('localyaku4').rules);
  const daisharin = mk('2p 2p 3p 3p 4p 4p 5p 5p 6p 6p 7p 7p 8p 8p');
  const r1 = evaluate(baseCtx({ hand: daisharin, winTile: daisharin[0], rules }));
  ok(r1.isYakuman && r1.yaku.some((y) => y.name === '大車輪'), '大車輪');

  // 同じ9枚は「三連刻」とも「一色三順」とも解釈できるため、店舗はどちらを採用するか選ぶ
  const nine = mk('2s 2s 2s 3s 3s 3s 4s 4s 4s 1m 2m 3m 9p 9p');
  const onlySanrenkou = resolveRules({ localYaku: [{ id: 'sanrenkou', enabled: true, han: 2 }] });
  const r2 = evaluate(baseCtx({ hand: nine, winTile: nine[9], tsumo: true, rules: onlySanrenkou }));
  ok(yakuNames(r2).includes('三連刻'), '三連刻を採用した場合');

  const onlyIsshoku = resolveRules({ localYaku: [{ id: 'isshoku_sanjun', enabled: true, han: 2 }] });
  const r3 = evaluate(baseCtx({ hand: nine, winTile: nine[9], tsumo: true, rules: onlyIsshoku }));
  ok(yakuNames(r3).includes('一色三順'), '一色三順を採用した場合');

  const gomon = mk('1m 2m 3m 2p 3p 4p 5s 6s 7s 1z 1z 1z 5z 5z');
  const r4 = evaluate(baseCtx({ hand: gomon, winTile: gomon[0], rules }));
  ok(yakuNames(r4).includes('五門斉'), '五門斉');
});

it('ローカル役は採用していないルールでは成立しない', () => {
  const daisharin = mk('2p 2p 3p 3p 4p 4p 5p 5p 6p 6p 7p 7p 8p 8p');
  const r = evaluate(baseCtx({ hand: daisharin, winTile: daisharin[0] }));
  no(r.isYakuman, '既定では大車輪にならない');
  ok(yakuNames(r).includes('清一色'), '通常の役（清一色・二盃口など）として計算される');
  const nine = mk('2s 2s 2s 3s 3s 3s 4s 4s 4s 1m 2m 3m 9p 9p');
  const r2 = evaluate(baseCtx({ hand: nine, winTile: nine[9], tsumo: true }));
  no(yakuNames(r2).includes('三連刻'), '三連刻は付かない');
  no(yakuNames(r2).includes('一色三順'), '一色三順も付かない');
});

it('未定義のローカル役IDは設定エラーになる', () => {
  const v = validateRules(resolveRules({ localYaku: [{ id: 'nonexistent', enabled: true, han: 2 }] }));
  ok(v.issues.some((i) => i.severity === 'error' && /ローカル役ID/.test(i.message)), 'エラー検出');
});

// ===========================================================================
describe('拡張：割れ目・抜き牌のバリエーション');

it('全員割れ目ではすべての支払いが倍になる', () => {
  const rules = resolveRules({ local: { wareme: { enabled: true, multiplier: 2, allPlayers: true } } });
  const s = settleWin({
    base: 1000, winner: 1, loser: 2, tsumo: false, dealerSeat: 0,
    playerCount: 4, rules, honba: 0, kyotaku: 0, wareme: null,
  });
  eq(s.deltas[1], 8000, '全員割れ目で2倍');
});

it('東天紅風では北以外（一萬・五萬・九萬）も抜ける', () => {
  const e = mkEngine(getPreset('toutenkou3').rules);
  const p = e.players[0];
  p.hand = mk('1m 5m 9m 1p 2p 3p 4p 5p 6p 7p 8p 9p 1s');
  p.drawn = p.hand[0];
  e.pending = { kind: 'turn', seat: 0 };
  const kitas = e.getChoices(0).filter((c) => c.type === 'kita');
  eq(kitas.length, 3, '1萬・5萬・9萬が抜ける');
  e.act(0, { type: 'kita', t: codeToType('5m') });
  eq(p.kita.length, 1, '抜いた');
  eq(p.kita[0].t, codeToType('5m'), '5萬を抜いた');
});

// ===========================================================================
describe('初心者向けの補助表示');

it('テンパイ時に待ち牌と残り枚数が出る', () => {
  const e = mkEngine();
  const p = e.players[0];
  p.hand = mk('2m 3m 4m 3p 4p 5p 6p 7p 8p 3s 4s 9p 9p');
  p.melds = [];
  const s = e.snapshot(0);
  eq(s.players[0].shanten, 0, 'テンパイ');
  ok(s.waits && s.waits.length === 2, '両面待ちで2種');
  eq(s.waits.map((w) => w.code).sort(), ['2s', '5s'], '待ちは2索・5索');
  ok(s.waits.every((w) => w.left >= 0 && w.left <= 4), '残り枚数が0〜4に収まる');
});

it('見えている牌の分だけ残り枚数が減る', () => {
  const e = mkEngine();
  const p = e.players[0];
  p.hand = mk('2m 3m 4m 3p 4p 5p 6p 7p 8p 3s 4s 9p 9p');
  p.melds = [];
  const before = e.snapshot(0).waits.find((w) => w.code === '2s').left;
  e.players[1].discards = mk('2s 2s');
  const after = e.snapshot(0).waits.find((w) => w.code === '2s').left;
  eq(after, before - 2, '河に2枚見えたら残りが2枚減る');
});

it('テンパイでなければ待ち牌は出ない', () => {
  const e = mkEngine();
  const p = e.players[0];
  p.hand = mk('1m 3m 5m 7m 9m 1p 3p 5p 7p 9p 1s 3s 5s');
  p.melds = [];
  eq(e.snapshot(0).waits, null, '向聴が残っていれば非表示');
});

it('手牌のドラを判別できる情報が渡る', () => {
  const e = mkEngine();
  const s = e.snapshot(0);
  ok(Array.isArray(s.doraTypes) && s.doraTypes.length >= 1, 'ドラの牌タイプが取れる');
});

describe('清一色ゲーム（2セット混ぜ）');

/** 牌に裏の色を付ける */
const withBack = (tiles, color) => tiles.map((t) => ({ ...t, back: color }));

it('萬子は1枚も入らない', () => {
  const r = resolveRules(getPreset('chinitsu3').rules);
  for (const round of [0, 1]) {
    const tiles = buildTileSet(r, round);
    eq(tiles.filter((t) => t.t < 9).length, 0, `${round}局目の萬子`);
  }
});

it('筒子の回と索子の回が交互になる', () => {
  const r = resolveRules(getPreset('chinitsu3').rules);
  const suits = [0, 1, 2, 3].map((round) => {
    const tiles = buildTileSet(r, round);
    const p = tiles.filter((t) => t.t >= 9 && t.t < 18).length;
    const so = tiles.filter((t) => t.t >= 18 && t.t < 27).length;
    return p > 0 ? 'p' : so > 0 ? 's' : '?';
  });
  eq(suits.join(''), 'psps', '東1局から順に使う色');
  // 片方の色を使う回は、もう片方は1枚も入らない
  const first = buildTileSet(r, 0);
  eq(first.filter((t) => t.t >= 18 && t.t < 27).length, 0, '筒子の回に索子は入らない');
});

it('数牌は1種8枚、字牌は1種4枚で100枚になる', () => {
  const r = resolveRules(getPreset('chinitsu3').rules);
  const tiles = buildTileSet(r, 0);
  eq(tiles.length, 100, '総枚数');
  eq(tiles.filter((t) => t.t === codeToType('1p')).length, 8, '1筒の枚数');
  eq(tiles.filter((t) => t.t === codeToType('5p')).length, 8, '5筒の枚数');
  eq(tiles.filter((t) => t.t === codeToType('1z')).length, 4, '東の枚数');
});

it('牌の裏は青と黄が半分ずつになる', () => {
  const r = resolveRules(getPreset('chinitsu3').rules);
  const tiles = buildTileSet(r, 0);
  eq(tiles.filter((t) => t.back === 'blue').length, 50, '青');
  eq(tiles.filter((t) => t.back === 'yellow').length, 50, '黄');
});

it('5筒・5索はすべてドラになる', () => {
  const r = resolveRules(getPreset('chinitsu3').rules);
  ok(r.dora.permanentDora.includes('5p'), '5筒が常時ドラ');
  ok(r.dora.permanentDora.includes('5s'), '5索が常時ドラ');
});

it('七対子の8枚使い：同じ牌4枚を2つの対子として認める', () => {
  const counts = new Array(34).fill(0);
  counts[codeToType('1p')] = 4;
  counts[codeToType('2p')] = 4;
  counts[codeToType('3p')] = 4;
  counts[codeToType('4p')] = 2;
  ok(isChiitoi(counts, makeHandOpts(null, true)), '8枚使いありなら七対子');
  no(isChiitoi(counts), '8枚使いなしなら七対子ではない');
});

it('同じ牌が8枚あるルールでは5枚目以降も待ちとして数える', () => {
  const limits = new Array(34).fill(4);
  limits[codeToType('5m')] = 8;
  const counts = new Array(34).fill(0);
  counts[codeToType('5m')] = 4;
  counts[codeToType('1p')] = 3;
  counts[codeToType('2p')] = 3;
  counts[codeToType('3p')] = 3;
  ok(waits(counts, 0, makeHandOpts(limits, false)).includes(codeToType('5m')), '5枚目の5萬が待ちに入る');
  no(waits(counts, 0).includes(codeToType('5m')), '通常ルールでは待ちに入らない');
});

it('背一色：牌の裏の色がそろえば役満', () => {
  const rules = resolveRules(getPreset('chinitsu3').rules);
  const hand = withBack(mk('1p 1p 1p 2p 3p 4p 5p 6p 7p 8p 8p 8p 9p 9p'), 'blue');
  const res = evaluate(baseCtx({ hand, winTile: hand[13], rules, tsumo: true }));
  ok(res.isYakuman, '役満として成立する');
  // この店は役満どまり（4倍満まで）なので、背一色も1倍で持つ
  ok(res.yaku.some((y) => y.name === '背一色' && y.yakuman === 1), '役満1倍');
});

it('背一色：裏の色が混ざっていれば成立しない', () => {
  const rules = resolveRules(getPreset('chinitsu3').rules);
  const hand = withBack(mk('1p 1p 1p 2p 3p 4p 5p 6p 7p 8p 8p 8p 9p 9p'), 'blue');
  hand[5].back = 'yellow';
  const res = evaluate(baseCtx({ hand, winTile: hand[13], rules, tsumo: true }));
  no(res.yaku.some((y) => y.name === '背一色'), '背一色は付かない');
});

it('背一色：裏に色が無い通常の麻雀では成立しない', () => {
  const rules = resolveRules({ localYaku: [{ id: 'seiiisou', enabled: true }] });
  const hand = mk('1p 1p 1p 2p 3p 4p 5p 6p 7p 8p 8p 8p 9p 9p');
  const res = evaluate(baseCtx({ hand, winTile: hand[13], rules, tsumo: true }));
  no(res.yaku.some((y) => y.name === '背一色'), '背一色は付かない');
});

describe('見た目が違う牌は、それぞれ切れる');

it('裏の色が違う同じ牌は、どちらも打牌の選択肢に入る', () => {
  const r = resolveRules(getPreset('chinitsu3').rules);
  const e = new GameEngine({ rules: r, seed: 3, players: [0, 1, 2].map((i) => ({ name: `P${i}`, isCpu: false })) });
  e.startKyoku();
  const p = e.players[0];
  const t = codeToType('1p');
  // 裏が青の1筒と黄の1筒を1枚ずつ持たせる
  const blue = e.wall.live.find((x) => x.t === t && x.back === 'blue');
  const yellow = e.wall.live.find((x) => x.t === t && x.back === 'yellow');
  ok(blue && yellow, '青裏と黄裏の1筒が山にある');
  p.hand = [blue, yellow, ...p.hand.filter((x) => x.t !== t).slice(0, 11)];
  e.turn = 0; e.phase = 'turn'; e.pending = { kind: 'turn', seat: 0 };

  const discard = e.getChoices(0).find((c) => c.type === 'discard');
  ok(discard.tileIds.includes(blue.id), '青裏を選べる');
  ok(discard.tileIds.includes(yellow.id), '黄裏も選べる');
});

it('裏の色で牌を見分ける（背一色を狙うのに要る）', () => {
  const blue = { t: 9, red: false, gold: false, blue: false, star: false, rainbow: false, dot: false, sp: null, back: 'blue' };
  const yellow = { ...blue, back: 'yellow' };
  ok(tileFaceKey(blue) !== tileFaceKey(yellow), '裏の色が違えば別の牌として扱う');
});

it('青5索とふつうの5索も、それぞれ切れる', () => {
  const plain = { t: 22, red: false, gold: false, blue: false, star: false, rainbow: false, dot: false, sp: null };
  const blue = { ...plain, blue: true };
  ok(tileFaceKey(plain) !== tileFaceKey(blue), '青牌は別の牌として扱う');
});

describe('待ち牌の残り枚数');

it('1種8枚のルールでは、4枚見えても「残り4枚」と出る', () => {
  const r = resolveRules(getPreset('chinitsu3').rules);
  const e = new GameEngine({ rules: r, seed: 11, players: [0, 1, 2].map((i) => ({ name: `P${i}`, isCpu: false })) });
  e.startKyoku();
  const p = e.players[0];
  const t = codeToType('1p');
  const pool = e.wall.live.filter((x) => x.t === t).slice(0, 4);
  e.wall.live = e.wall.live.filter((x) => !pool.includes(x));
  e.wall.liveEnd = e.wall.live.length;
  p.hand = [...pool, ...p.hand.filter((x) => x.t !== t).slice(0, 9)];
  const counts = new Array(34).fill(0);
  for (const x of p.hand) counts[x.t]++;
  const d = e.waitDetail([t], counts);
  eq(d[0].left, 4, '8枚あるうち4枚見えたので残り4枚');
});

it('ふつうのルールでは、4枚見えたら「残り0枚」', () => {
  const r = resolveRules(getPreset('standard4').rules);
  const e = new GameEngine({ rules: r, seed: 11, players: [0, 1, 2, 3].map((i) => ({ name: `P${i}`, isCpu: false })) });
  e.startKyoku();
  const p = e.players[0];
  const t = codeToType('1p');
  const pool = e.wall.live.filter((x) => x.t === t).slice(0, 4);
  e.wall.live = e.wall.live.filter((x) => !pool.includes(x));
  e.wall.liveEnd = e.wall.live.length;
  p.hand = [...pool, ...p.hand.filter((x) => x.t !== t).slice(0, 9)];
  const counts = new Array(34).fill(0);
  for (const x of p.hand) counts[x.t]++;
  const d = e.waitDetail([t], counts);
  eq(d[0].left, 0, '4枚しかないので残り0枚');
});

describe('清一色ゲーム：5枚目以降をカンに足す');

/** 山から指定の牌をn枚取り出して手牌に移す */
function grabInto(e, p, t, n) {
  const got = e.wall.live.filter((x) => x.t === t).slice(0, n);
  e.wall.live = e.wall.live.filter((x) => !got.includes(x));
  e.wall.liveEnd = e.wall.live.length;
  p.hand.push(...got);
  return got;
}

function chinitsuEngineWith(t, n) {
  const r = resolveRules(getPreset('chinitsu3').rules);
  const e = new GameEngine({ rules: r, seed: 7, players: [0, 1, 2].map((i) => ({ name: `P${i}`, isCpu: false })) });
  e.startKyoku();
  const p = e.players[0];
  p.hand = p.hand.filter((x) => x.t !== t);
  grabInto(e, p, t, n);
  e.turn = 0; e.phase = 'turn'; e.pending = { kind: 'turn', seat: 0 };
  return { e, p };
}

it('同じ牌が8枚あるので、暗槓したあとも5枚目6枚目を足せる', () => {
  const { e, p } = chinitsuEngineWith(codeToType('1p'), 6);
  e.act(0, { type: 'kan', kind: 'ankan', t: codeToType('1p') });
  eq(p.melds[0].tiles.length, 4, '暗槓は4枚');

  const add = e.getChoices(0).find((c) => c.kind === 'kanadd');
  ok(add, '「カンに足す」が選べる');
  e.act(0, { type: 'kan', kind: 'kanadd', t: codeToType('1p') });
  eq(p.melds[0].tiles.length, 5, '5枚目が入る');
  e.act(0, { type: 'kan', kind: 'kanadd', t: codeToType('1p') });
  eq(p.melds[0].tiles.length, 6, '6枚目が入る');
});

it('カンに足すたびにドラ表示牌が増える', () => {
  const { e } = chinitsuEngineWith(codeToType('1p'), 6);
  const before = e.wall.doraIndicators.length;
  e.act(0, { type: 'kan', kind: 'ankan', t: codeToType('1p') });
  eq(e.wall.doraIndicators.length, before + 1, '暗槓で1枚');
  e.act(0, { type: 'kan', kind: 'kanadd', t: codeToType('1p') });
  eq(e.wall.doraIndicators.length, before + 2, '5枚目で1枚');
  e.act(0, { type: 'kan', kind: 'kanadd', t: codeToType('1p') });
  eq(e.wall.doraIndicators.length, before + 3, '6枚目で1枚');
});

it('カンに足しても面子は増えない（カンの回数は変わらない）', () => {
  const { e } = chinitsuEngineWith(codeToType('1p'), 6);
  e.act(0, { type: 'kan', kind: 'ankan', t: codeToType('1p') });
  const n = e.kanCount;
  e.act(0, { type: 'kan', kind: 'kanadd', t: codeToType('1p') });
  eq(e.kanCount, n, 'カンの回数は増えない');
});

it('6枚のカンは、ドラなら6枚ぶん数える', () => {
  const r = resolveRules(getPreset('chinitsu3').rules);
  const t = codeToType('1p');
  const mk = (n) => Array.from({ length: n }, (_, i) => ({
    id: 900 + i, t, red: false, gold: false, blue: false, star: false, rainbow: false, dot: false, sp: null,
  }));
  const ctx = {
    hand: [], melds: [{ kind: 'kan', tiles: mk(6), concealed: true, from: 0, calledTile: mk(1)[0] }],
    rules: r, doraTypes: [t], uraTypes: [], kitaCount: 0, flags: {},
  };
  const d = countDora(ctx);
  eq(d.dora, 6, '1筒がドラなら、6枚のカンは6枚ぶん数える');
});

it('暗槓に足すぶんは暗槓のまま（槍槓されない）', () => {
  const { e, p } = chinitsuEngineWith(codeToType('1p'), 6);
  e.act(0, { type: 'kan', kind: 'ankan', t: codeToType('1p') });
  ok(p.melds[0].concealed, '暗槓である');
  e.act(0, { type: 'kan', kind: 'kanadd', t: codeToType('1p') });
  // 槍槓の待ちに入らず、そのまま自分の手番に戻る
  eq(e.pending.kind, 'turn', '槍槓の受け答えにならない');
  eq(e.pending.seat, 0, '自分の手番のまま');
});

it('明槓に足すぶんは加槓と同じ扱い（槍槓の機会がある）', () => {
  const t = codeToType('1p');
  const { e, p } = chinitsuEngineWith(t, 6);
  // ポン→加槓で明槓を作ってから、5枚目を足す
  e.act(0, { type: 'kan', kind: 'ankan', t });
  // いま作ったのは暗槓なので、明槓として扱えるよう伏せを外す
  p.melds[0].concealed = false;
  e.act(0, { type: 'kan', kind: 'kanadd', t });
  // 待っている人がいなければ手番に戻る。いれば槍槓の受け答えになる。
  ok(e.pending.kind === 'turn' || (e.pending.kind === 'claim' && e.pending.chankan),
    '手番に戻るか、槍槓の受け答えになる');
  eq(p.melds[0].tiles.length, 5, '5枚目は入っている');
});

it('清一色ゲーム：14翻で数え役満、2翻ごとに5倍満・6倍満と伸びる', () => {
  const r = resolveRules(getPreset('chinitsu3').rules);
  const at = (han) => basePoints({ han, fu: 30, yakuman: 0 }, r);
  eq(at(13).limitName, '三倍満', '13翻はまだ三倍満');
  eq(at(14).limitName, '数え役満', '14翻で数え役満');
  eq(at(14).base, 8000, '数え役満は8000');
  eq(at(16).limitName, '5倍満', '16翻で5倍満');
  eq(at(16).base, 10000, '5倍満は10000');
  eq(at(18).limitName, '6倍満', '18翻で6倍満');
  eq(at(20).limitName, '7倍満', '20翻で7倍満');
});

it('清一色ゲーム：本物の役満は複合しても役満どまり', () => {
  const r = resolveRules(getPreset('chinitsu3').rules);
  for (const y of [1, 2, 3]) {
    const b = basePoints({ han: 0, fu: 30, yakuman: y }, r);
    eq(b.base, 8000, `役満×${y} でも8000`);
    eq(b.limitName, '役満', `役満×${y} でも「役満」`);
  }
});

it('ふつうのルールでは、数え役満は伸びず役満も倍になる', () => {
  const r = resolveRules(getPreset('standard4').rules);
  eq(r.scoring.countedYakumanStepHan, 0, '伸ばさない');
  eq(r.scoring.maxYakumanMultiplier, 0, '上限なし');
  eq(basePoints({ han: 0, fu: 30, yakuman: 2 }, r).base, 16000, 'ダブル役満は16000');
});

it('ふつうのルールでは、カンに足す選択肢は出ない', () => {
  const r = resolveRules(getPreset('standard4').rules);
  eq(r.win.kanBeyondFour, false, '既定では足せない');
});

describe('本場の点数');

it('本場は設定した「場に○○点」で動く（人数×100の決め打ちではない）', () => {
  const cases = [['standard4', 300], ['standard3', 1000], ['goto_standard', 2000]];
  for (const [id, want] of cases) {
    const r = resolveRules(getPreset(id).rules);
    eq(r.scoring.honbaPoints, want, `${id} の設定`);
    const n = r.game.players;
    const arg = { base: 2000, winner: 0, dealerSeat: 2, playerCount: n, rules: r, kyotaku: 0, wareme: null };
    const ron0 = settleWin({ ...arg, loser: 1, tsumo: false, honba: 0 });
    const ron1 = settleWin({ ...arg, loser: 1, tsumo: false, honba: 1 });
    eq(ron1.deltas[0] - ron0.deltas[0], want, `${id} のロン1本場`);
    const tsu0 = settleWin({ ...arg, loser: null, tsumo: true, honba: 0 });
    const tsu1 = settleWin({ ...arg, loser: null, tsumo: true, honba: 1 });
    eq(tsu1.deltas[0] - tsu0.deltas[0], want, `${id} のツモ1本場`);
  }
});

describe('出典で確認した値の固定');

// 説明文に書いていない値は、食い違い検査では守れない。
// 調べて根拠のある数字は、ここで直接おさえておく。

it('一般四麻：ウマはフリー雀荘で最も多い5-10', () => {
  const r = resolveRules(getPreset('standard4').rules);
  eq(JSON.stringify(r.scoring.uma), JSON.stringify([10, 5, -5, -10]), 'ウマ5-10');
  eq(r.scoring.startingPoints, 25000, '25000持ち');
  eq(r.scoring.returnPoints, 30000, '30000返し');
  ok(r.scoring.okaToTop, 'オカはトップが総取り');
});

it('Mリーグ：途中流局なし・頭ハネ・切り上げ満貫あり・数え役満なし', () => {
  const r = resolveRules(getPreset('mleague4').rules);
  for (const k of ['kyuushuKyuuhai', 'suufonRenda', 'suukaikan', 'suuchaRiichi']) {
    eq(r.renchan[k], false, `途中流局 ${k}`);
  }
  eq(r.win.doubleRon, false, 'ダブロンなし＝頭ハネ');
  eq(r.scoring.roundUpMangan, true, '切り上げ満貫あり');
  eq(r.scoring.countedYakuman, false, '数え役満なし');
  eq(r.ryuukyoku.nagashiMangan, false, '流し満貫なし');
  eq(JSON.stringify(r.scoring.uma), JSON.stringify([30, 10, -10, -30]), 'ウマ10-30');
});

it('五等サンマ：本場2000点・ノーテン罰符4000点・5は赤金黒黒', () => {
  const r = resolveRules(getPreset('goto_standard').rules);
  eq(r.scoring.honbaPoints, 2000, '本場は場に2000点');
  eq(r.ryuukyoku.notenPenalty, 4000, 'ノーテン罰符は場に4000点');
  eq(r.dora.red['5p'], 1, '5筒の赤は1枚');
  eq(r.dora.gold['5p'], 1, '5筒の金は1枚');
  eq(r.dora.indicators, 2, 'ドラ表示牌は常時2枚');
  ok(r.sanma.tsumoLoss, 'ツモ損あり');
  ok(r.scoring.rankOnly, '完全順位戦');
});

it('関西三麻：萬子は抜く・ウマ30/-10/-20・本場1000点・平和ツモなし', () => {
  const r = resolveRules(getPreset('kansai3').rules);
  ok(r.sanma.removeManzu, '萬子2〜8を抜く');
  eq(JSON.stringify(r.scoring.uma), JSON.stringify([30, -10, -20]), 'ウマ');
  eq(r.scoring.honbaPoints, 1000, '本場1000点');
  eq(r.win.pinfuTsumo, false, '平和ツモなし');
  eq(r.sanma.northMode, 'yakuhai', '北は役牌');
  ok(r.flowers.enabled && r.flowers.isDora, '抜きドラは花牌');
  ok(r.local.openRiichi.enabled, 'オープンリーチあり');
});

it('ロケット五等：華牌「夏」は昇格と加点の両方', () => {
  const r = resolveRules(getPreset('rocket3').rules);
  const summer = r.flowers.effects.summer || [];
  ok(summer.some((e) => e.type === 'rankUp'), '役が昇格する');
  ok(summer.some((e) => e.type === 'bonusPerTile' && e.value === 20), '20点が付く');
  eq(r.scoring.flat.yakumanPoints, 32, '役満は32点');
  eq(r.scoring.flat.fuFixed, 40, '40符固定');
});

describe('実ルールとの照合（東天紅・少牌マイティ・競技ルール）');

it('競技ルール：一発は役としても付かない', () => {
  const r = resolveRules(getPreset('competition4').rules);
  eq(r.win.ippatsu, false, '一発を採らない設定');
  eq(r.dora.ura, false, '裏ドラなし');
  eq(Object.keys(r.dora.red).length, 0, '赤なし');
  // 裏ドラを切るだけでは「一発なし」にならない。役の側も落ちていること
  const flags = { riichi: true, ippatsu: true, menzen: true, tsumo: false };
  ok(!(r.win.ippatsu !== false && flags.ippatsu), '一発の判定が落ちる');
});

it('一般四麻では一発が付く（競技ルールとの違い）', () => {
  const r = resolveRules(getPreset('standard4').rules);
  eq(r.win.ippatsu, true, '一発あり');
  eq(r.dora.ura, true, '裏ドラあり');
});


it('東天紅：筒子・索子の5が常時ドラになる', () => {
  const r = resolveRules(getPreset('toutenkou3').rules);
  ok(r.dora.permanentDora.includes('5p'), '5筒');
  ok(r.dora.permanentDora.includes('5s'), '5索');
});

it('東天紅：ガリは1枚1点として和了者の点に乗る', () => {
  const r = resolveRules(getPreset('toutenkou3').rules);
  const hand = { han: 3, fu: 30, yakuman: 0 };
  const none = basePoints({ ...hand, nukiCount: 0 }, r);
  const three = basePoints({ ...hand, nukiCount: 3 }, r);
  eq(three.pointsPerPayer - none.pointsPerPayer, 3, 'ガリ3枚ぶん');
});

it('東天紅：役満にもガリの点が乗る', () => {
  const r = resolveRules(getPreset('toutenkou3').rules);
  const none = basePoints({ han: 0, fu: 30, yakuman: 1, nukiCount: 0 }, r);
  const two = basePoints({ han: 0, fu: 30, yakuman: 1, nukiCount: 2 }, r);
  eq(none.pointsPerPayer, 50, '役満は50点');
  eq(two.pointsPerPayer, 52, '役満50点＋ガリ2枚');
});

it('抜き牌の点は、既定のルールでは加算されない', () => {
  const r = resolveRules({});
  eq(r.scoring.flat.nukiPoints, 0, '既定は0');
});

it('少牌マイティ：公式ルールどおりの設定になっている', () => {
  const r = resolveRules(getPreset('mighty3').rules);
  eq(r.game.length, 'east_south', '東南戦');
  eq(r.renchan.dealerRepeat, 'tenpai', 'テンパイ連荘');
  eq(r.scoring.startingPoints, 30000, '30,000点持ち');
  eq(r.scoring.returnPoints, 30000, '30,000点返し');
  eq(Object.keys(r.dora.red).length, 0, '赤牌なし');
  eq(r.dora.ura, false, '裏ドラなし');
  eq(r.sanma.northMode, 'yakuhai', '北は共通役牌');
  ok(r.local.openRiichi.enabled, 'オープンリーチあり');
  ok(r.local.chiitoiMultiPair, '4枚使い七対子あり');
  ok(r.localYaku.some((y) => y.id === 'daisharin' && y.yakuman === 1), '大車輪は役満');
});

describe('未実装だったローカル役（燕返し・七星無靠）');

it('燕返し：相手のリーチ宣言牌をロンすると成立する', () => {
  const rules = resolveRules({ localYaku: [{ id: 'tsubamegaeshi', enabled: true }] });
  const hand = mk('1p 1p 1p 2p 3p 4p 5p 6p 7p 8p 8p 8p 9p 9p');
  const flags = { ...baseCtx().flags, tsubame: true };
  const res = evaluate(baseCtx({ hand, winTile: hand[13], rules, tsumo: false, flags }));
  ok(res.yaku.some((y) => y.name === '燕返し'), '燕返しが付く');
});

it('燕返し：ふつうのロンでは成立しない', () => {
  const rules = resolveRules({ localYaku: [{ id: 'tsubamegaeshi', enabled: true }] });
  const hand = mk('1p 1p 1p 2p 3p 4p 5p 6p 7p 8p 8p 8p 9p 9p');
  const res = evaluate(baseCtx({ hand, winTile: hand[13], rules, tsumo: false }));
  no(res.yaku.some((y) => y.name === '燕返し'), '燕返しは付かない');
});

it('七星無靠：字牌7種と色ごとに別の筋の数牌で和了になる', () => {
  const rules = resolveRules({ localYaku: [{ id: 'chiiseimukou', enabled: true }] });
  const opts = makeHandOpts(null, false, true);
  const hand = mk('1m 4m 7m 2p 5p 8p 3s 1z 2z 3z 4z 5z 6z 7z');
  const counts = countsFromTiles(hand);
  ok(isChiiseimukou(counts), '和了形として認められる');
  eq(shanten(counts, 0, opts), -1, '向聴数は -1（和了）');
  const res = evaluate(baseCtx({ hand, winTile: hand[13], rules, tsumo: true, handOpts: opts }));
  ok(res && res.isYakuman, '役満として成立する');
  ok(res.yaku.some((y) => y.name === '七星無靠'), '七星無靠が付く');
});

it('七星無靠：同じ筋を2色で使うと成立しない', () => {
  const hand = mk('1m 4m 7m 1p 4p 7p 3s 1z 2z 3z 4z 5z 6z 7z');
  no(isChiiseimukou(countsFromTiles(hand)), '同じ筋の重複は不可');
});

it('七星無靠：採用していないルールでは和了形にならない', () => {
  const hand = mk('1m 4m 7m 2p 5p 8p 3s 1z 2z 3z 4z 5z 6z 7z');
  const counts = countsFromTiles(hand);
  ok(shanten(counts, 0) > -1, '既定のルールでは和了ではない');
});

describe('少牌マイティの公式役（萬子の混一色・お多福）');

const mightyRules = () => resolveRules({
  localYaku: [
    { id: 'manzuhonitsu', enabled: true, yakuman: 1 },
    { id: 'otafuku', enabled: true },
  ],
});

it('萬子の混一色は役満になる', () => {
  const hand = mk('1m 1m 1m 9m 9m 9m 1z 1z 1z 2z 2z 3z 3z 3z');
  const res = evaluate(baseCtx({ hand, winTile: hand[13], rules: mightyRules(), tsumo: true }));
  ok(res.isYakuman, '役満として成立する');
  ok(res.yaku.some((y) => y.name === '萬子の混一色'), '萬子の混一色が付く');
});

it('筒子の混一色では成立しない（萬子限定の役）', () => {
  const hand = mk('1p 1p 1p 9p 9p 9p 1z 1z 1z 2z 2z 3z 3z 3z');
  const res = evaluate(baseCtx({ hand, winTile: hand[13], rules: mightyRules(), tsumo: true }));
  no(res.yaku.some((y) => y.name === '萬子の混一色'), '萬子でなければ付かない');
});

it('字牌が無ければ萬子の混一色にはならない', () => {
  const rules = mightyRules();
  const hand = mk('1m 1m 1m 2m 3m 4m 5m 6m 7m 8m 8m 8m 9m 9m');
  const res = evaluate(baseCtx({ hand, winTile: hand[13], rules, tsumo: true }));
  no(res.yaku.some((y) => y.name === '萬子の混一色'), '混一色ではなく清一色の形');
});

it('お多福：5面待ち以上で、待ちの種類ぶん翻が増える', () => {
  const rules = mightyRules();
  const hand = mk('2p 3p 4p 6p 7p 8p 5p 5p 1s 1s 1s 1z 1z 1z');
  const flags = { ...baseCtx().flags, waitKinds: 5, furiten: false };
  const res = evaluate(baseCtx({ hand, winTile: hand[13], rules, tsumo: true, flags }));
  const y = res.yaku.find((v) => v.name === 'お多福');
  ok(y, 'お多福が付く');
  eq(y.han, 5, '5面待ちなら5翻');
});

it('お多福：4面待ちでは成立しない', () => {
  const rules = mightyRules();
  const hand = mk('2p 3p 4p 6p 7p 8p 5p 5p 1s 1s 1s 1z 1z 1z');
  const flags = { ...baseCtx().flags, waitKinds: 4, furiten: false };
  const res = evaluate(baseCtx({ hand, winTile: hand[13], rules, tsumo: true, flags }));
  no(res.yaku.some((v) => v.name === 'お多福'), '5面待ちに満たない');
});

it('お多福：フリテンでは成立しない', () => {
  const rules = mightyRules();
  const hand = mk('2p 3p 4p 6p 7p 8p 5p 5p 1s 1s 1s 1z 1z 1z');
  const flags = { ...baseCtx().flags, waitKinds: 6, furiten: true };
  const res = evaluate(baseCtx({ hand, winTile: hand[13], rules, tsumo: true, flags }));
  no(res.yaku.some((v) => v.name === 'お多福'), 'フリテンなら付かない');
});

describe('検索の表記ゆれ');

it('ひらがな・カタカナ・全角半角を揃えて比べる', () => {
  eq(normalize('しろぽっち'), normalize('シロポッチ'), 'かなの種類を揃える');
  eq(normalize('ｱﾘｽ'), normalize('アリス'), '半角カナと全角カナ');
  eq(normalize('ＧＯＴＯ'), normalize('goto'), '全角英字と大文字小文字');
  eq(normalize('白 ポッチ'), normalize('白・ポッチ'), '空白と中黒は落とす');
});

it('漢字の言葉を、かなで打っても引ける', () => {
  const hay = storeHaystack({ name: 'DEMO雀荘 四麻館', area: '東京都・新宿' }, null);
  ok(matchText(hay, 'しろぽっち') === false, 'ない言葉は引っかからない');
  ok(matchText(hay, 'しんじゅく'), '新宿 を しんじゅく で引ける');
  ok(matchText(hay, 'よんまかん'), '四麻館 を よんまかん で引ける');
  ok(matchText(hay, 'じゃんそう'), '雀荘 を じゃんそう で引ける');
});

it('プリセットも、かなで引ける', () => {
  const hay = presetHaystack(getPreset('toutenkou3'));
  ok(matchText(hay, 'とうてんこう'), '東天紅 を かなで引ける');
  ok(matchText(hay, '東天紅'), '漢字でも引ける');
});

it('空白区切りはAND検索になる', () => {
  const hay = storeHaystack({ name: 'DEMO雀荘 四麻館', area: '東京都・新宿' }, null);
  ok(matchText(hay, 'しんじゅく よんま'), '両方あればヒット');
  no(matchText(hay, 'しんじゅく ごとう'), '片方が無ければヒットしない');
});

describe('ジュエル（宝石牌）の役');

const jewelRules = () => resolveRules({
  specialTiles: [
    { id: 'amethyst5p', name: 'アメジスト5筒', tile: '5p', count: 1, color: 'blue' },
    { id: 'pearl5s', name: 'パール5索', tile: '5s', count: 1, color: 'silver' },
    { id: 'lapis5m', name: 'ラピス5萬', tile: '5m', count: 1, color: 'blue' },
  ],
  localYaku: [{ id: 'jewel', enabled: true }, { id: 'jewelbox', enabled: true }],
});

it('宝石牌を3種類そろえるとジュエルが付く', () => {
  // 卓に4種類あるうち3種類なので、宝石箱（役満）にはならない。
  // 役満が成立すると通常役は出ないため、1翻の役を確かめるには
  // 全種類そろっていない形にする必要がある
  const rules = resolveRules({
    specialTiles: [
      { id: 'amethyst5p', name: 'アメジスト5筒', tile: '5p', count: 1, color: 'blue' },
      { id: 'pearl5s', name: 'パール5索', tile: '5s', count: 1, color: 'silver' },
      { id: 'lapis5m', name: 'ラピス5萬', tile: '5m', count: 1, color: 'blue' },
      { id: 'topaz_haku', name: '琥珀白', tile: '5z', count: 1, color: 'gold' },
    ],
    localYaku: [{ id: 'jewel', enabled: true }, { id: 'jewelbox', enabled: true }],
  });
  const hand = mk('3p 4p s:amethyst5p:5p 3s 4s s:pearl5s:5s 3m 4m s:lapis5m:5m 1p 1p 1p 9p 9p');
  const res = evaluate(baseCtx({ hand, winTile: hand[13], rules, tsumo: true }));
  ok(res, '和了として評価される');
  no(res.isYakuman, '全種類そろっていないので役満ではない');
  ok(res.yaku.some((y) => y.name === 'ジュエル'), 'ジュエルが付く');
});

it('宝石牌が2種類ではジュエルにならない', () => {
  const rules = jewelRules();
  const hand = mk('3p 4p s:amethyst5p:5p 3s 4s s:pearl5s:5s 3m 4m 5m 1p 1p 1p 9p 9p');
  const res = evaluate(baseCtx({ hand, winTile: hand[13], rules, tsumo: true }));
  no(res.yaku.some((y) => y.name === 'ジュエル'), '3種類に満たない');
});

it('その卓の宝石牌を全種類そろえると宝石箱（役満）', () => {
  const rules = jewelRules();
  const hand = mk('3p 4p s:amethyst5p:5p 3s 4s s:pearl5s:5s 3m 4m s:lapis5m:5m 1p 1p 1p 9p 9p');
  const res = evaluate(baseCtx({ hand, winTile: hand[13], rules, tsumo: true }));
  ok(res.isYakuman, '役満として成立する');
  ok(res.yaku.some((y) => y.name === '宝石箱'), '宝石箱が付く');
});

it('宝石牌を置いていないルールでは、どちらも成立しない', () => {
  const rules = resolveRules({ localYaku: [{ id: 'jewel', enabled: true }, { id: 'jewelbox', enabled: true }] });
  const hand = mk('1p 1p 1p 2p 3p 4p 5p 6p 7p 8p 8p 8p 9p 9p');
  const res = evaluate(baseCtx({ hand, winTile: hand[13], rules, tsumo: true }));
  no(res.yaku.some((y) => y.name === 'ジュエル' || y.name === '宝石箱'), 'どちらも付かない');
});

// ===========================================================================
console.log(`\n=== 結果: ${pass} 件成功 / ${fail} 件失敗 ===`);
if (fail) {
  console.log('\n失敗一覧:');
  for (const f of failures) console.log(` - ${f}`);
  process.exit(1);
}
