/**
 * effects.js - 特殊牌 / 花牌 / アリス・チューリップ / サイコロ / カスタムルールの実行エンジン
 *
 * ここが「未知のハウスルールを後から足せる」層。
 * ゲーム進行（engine.js）は「いつ effects を呼ぶか」だけを知り、
 * 「何が起きるか」は一切知らない。
 */
import { codeToType, neighborTypes, typeName, isFlower } from './tiles.js';
import { FLOWER_ID, FLOWER_LABEL } from './wall.js';

const empty = () => ({
  extraDora: 0, extraHan: 0, bonus: 0, points: 0, rankUp: 0,
  doubleDoraTypes: [], messages: [], diceRolls: [], aliceFlips: [],
});

function mergeInto(a, b) {
  a.extraDora += b.extraDora || 0;
  a.extraHan += b.extraHan || 0;
  a.bonus += b.bonus || 0;
  a.points += b.points || 0;
  a.rankUp += b.rankUp || 0;
  a.doubleDoraTypes.push(...(b.doubleDoraTypes || []));
  a.messages.push(...(b.messages || []));
  a.diceRolls.push(...(b.diceRolls || []));
  a.aliceFlips.push(...(b.aliceFlips || []));
  // フラグ系（花牌・特殊牌が立てる特別扱い）も引き継ぐ
  if (b.aliceTrigger) a.aliceTrigger = (a.aliceTrigger || 0) + b.aliceTrigger;
  if (b.tulipTrigger) a.tulipTrigger = (a.tulipTrigger || 0) + b.tulipTrigger;
  if (b.diceTrigger) a.diceTrigger = true;
  if (b.scoreMultiply) a.scoreMultiply = (a.scoreMultiply || 1) * b.scoreMultiply;
  if (b.extraUra) a.extraUra = (a.extraUra || 0) + b.extraUra;
  if (b.doubleFives) a.doubleFives = true;
  if (b.forceYakuman) a.forceYakuman = (a.forceYakuman || 0) + b.forceYakuman;
  if (b.bonusMultiply) a.bonusMultiply = (a.bonusMultiply || 1) * b.bonusMultiply;
  return a;
}

// ---------------------------------------------------------------------------
// 特殊牌
// ---------------------------------------------------------------------------
function conditionsOk(cond = {}, ctx) {
  if (cond.menzenOnly && !ctx.menzen) return false;
  if (cond.riichiOnly && !ctx.flags.riichi) return false;
  if (cond.tsumoOnly && !ctx.tsumo) return false;
  if (cond.ronOnly && ctx.tsumo) return false;
  if (cond.ippatsuOnly && !ctx.flags.ippatsu) return false;
  if (cond.openInvalid && !ctx.menzen) return false;
  if (cond.combo && cond.combo.length) {
    const ids = new Set(ctx.allTiles.filter((t) => t.sp).map((t) => t.sp));
    if (!cond.combo.every((id) => ids.has(id))) return false;
  }
  return true;
}

/**
 * 手牌・副露に含まれる特殊牌の効果を集計。
 * @param {Object} rules
 * @param {Object} ctx {allTiles, menzen, tsumo, flags}
 */
export function applySpecialTiles(rules, ctx) {
  const res = empty();
  const defs = new Map((rules.specialTiles || []).map((d) => [d.id, d]));
  const counted = new Map();
  for (const tile of ctx.allTiles) {
    if (!tile.sp) continue;
    counted.set(tile.sp, (counted.get(tile.sp) || 0) + 1);
  }
  let bonusMultiply = 1;
  for (const [id, n] of counted) {
    const def = defs.get(id);
    if (!def || !conditionsOk(def.conditions, ctx)) continue;
    for (const eff of def.effects || []) {
      const stackOnce = def.stacking === 'once' || eff.perTile === false;
      const v = (eff.value ?? 1) * (stackOnce ? 1 : n);
      switch (eff.type) {
        case 'dora': res.extraDora += v; break;
        case 'han': res.extraHan += v; break;
        case 'bonus': res.bonus += v; break;
        case 'rankUp': res.rankUp += v; break;
        case 'doubleDora': res.doubleDoraTypes.push(...(eff.tiles || []).map(codeToType)); break;
        case 'bonusMultiply': bonusMultiply *= (eff.value ?? 2); break;
        case 'yakuman': res.forceYakuman = (res.forceYakuman || 0) + 1; break;
        case 'alice': res.aliceTrigger = (res.aliceTrigger || 0) + (eff.value ?? 1); break;
        case 'tulip': res.tulipTrigger = (res.tulipTrigger || 0) + (eff.value ?? 1); break;
        case 'dice': res.diceTrigger = true; break;
        case 'scoreMultiply': res.scoreMultiply = (res.scoreMultiply || 1) * (eff.value ?? 2); break;
        case 'ura': res.extraUra = (res.extraUra || 0) + v; break;
        // 牌の数字ぶんのボーナス（8索なら8×n）。字牌は数字を持たないので0
        case 'bonusByNumber': {
          const t = codeToType(def.tile);
          const num = t < 27 ? (t % 9) + 1 : 0;
          res.bonus += num * (eff.value ?? 1) * (stackOnce ? 1 : n);
          break;
        }
        // 数牌ならそのまま、字牌なら2倍のボーナス
        case 'bonusByKind': {
          const t = codeToType(def.tile);
          const mul = t >= 27 ? 2 : 1;
          res.bonus += (eff.value ?? 1) * mul * (stackOnce ? 1 : n);
          break;
        }
        default: break;
      }
    }
    res.messages.push(`${def.name} ×${n}`);
  }
  if (bonusMultiply !== 1) res.bonusMultiply = bonusMultiply;
  return res;
}

/** オールマイティとして使える牌（白ポッチ・特殊牌）を返す */
export function almightyTiles(rules, tiles, flags, tsumo) {
  const out = [];
  const p = rules.local.shiroPocchi;
  const okCond = (mode) => {
    if (mode === 'always') return true;
    if (mode === 'any_tsumo') return tsumo;
    return tsumo && flags.riichi; // riichi_tsumo
  };
  for (const t of tiles) {
    if (t.dot && p.enabled && (p.mode === 'almighty' || p.mode === 'both') && okCond(p.almightyCondition)) {
      out.push(t);
      continue;
    }
    if (t.sp) {
      const def = (rules.specialTiles || []).find((d) => d.id === t.sp);
      if (def && (def.effects || []).some((e) => e.type === 'almighty')) {
        const c = def.conditions || {};
        if ((!c.tsumoOnly || tsumo) && (!c.riichiOnly || flags.riichi)) out.push(t);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// アリス / チューリップ
// ---------------------------------------------------------------------------
/**
 * @param {Object} cfg rules.local.alice もしくは tulip 相当
 * @param {Wall} wall
 * @param {Object} ctx {handTiles, winTile, menzen, tsumo, flags}
 * @param {number} [multiplier] 花牌「冬」などによる倍率
 */
export function runFlipBonus(cfg, wall, ctx, label = 'アリス', multiplier = 1) {
  const res = empty();
  if (!cfg.enabled) return res;
  if (cfg.requireMenzen && !ctx.menzen) return res;
  if (cfg.requireRiichi && !ctx.flags.riichi) return res;
  if (cfg.tsumoOnly && !ctx.tsumo) return res;

  const targets = new Set();
  if (cfg.matchTarget === 'winTile') targets.add(ctx.winTile.t);
  else for (const t of ctx.handTiles) targets.add(t.t);
  if (cfg.matchMode === 'tulip') {
    for (const t of [...targets]) for (const n of neighborTypes(t)) targets.add(n);
  }
  const handCount = {};
  for (const t of ctx.handTiles) handCount[t.t] = (handCount[t.t] || 0) + 1;

  const seq = wall.flipSequence(cfg);
  let matches = 0;
  for (let i = 0; i < Math.min(cfg.maxFlips, seq.length); i++) {
    const tile = seq[i];
    const hit = targets.has(tile.t) && !isFlower(tile.t);
    const weight = hit
      ? (cfg.kotsuMode === 'each' ? (handCount[tile.t] || 1) : 1)
      : 0;
    res.aliceFlips.push({ tile, matched: hit, label });
    if (!hit) break;
    matches += weight;
    if (!cfg.continueOnMatch) break;
  }
  if (matches > 0) {
    const mult = (ctx.tsumo ? cfg.tsumoMultiplier : cfg.ronMultiplier) * multiplier;
    res.bonus = Math.min(cfg.max, matches * cfg.bonusPerMatch * mult);
    res.points = matches * cfg.pointsPerMatch * mult;
    res.messages.push(`${label}成立：${matches}枚一致（+${res.bonus}BP）`);
  } else {
    res.messages.push(`${label}不成立`);
  }
  return res;
}

// ---------------------------------------------------------------------------
// サイコロチャンス / 出目金（汎用 Dice Bonus Engine）
// ---------------------------------------------------------------------------
export function rollDiceBonus(cfg, rng, triggers) {
  const res = empty();
  if (!cfg.enabled) return res;
  const fired = (cfg.triggers || []).filter((t) => triggers.includes(t));
  if (!fired.length) return res;

  let total = 0;
  let mult = 1;
  let rolling = true;
  let guard = 0;
  while (rolling && guard++ < 5) {
    const rolls = [];
    for (let i = 0; i < cfg.count; i++) rolls.push(1 + Math.floor(rng() * 6));
    res.diceRolls.push(rolls);
    const sum = rolls.reduce((a, b) => a + b, 0);
    total += sum;
    const allSame = rolls.every((r) => r === rolls[0]);
    if (allSame && rolls[0] === 1) {
      mult *= cfg.pinzoroMultiplier;
      res.messages.push(`ピンゾロ！ ボーナス×${cfg.pinzoroMultiplier}`);
      rolling = false;
    } else if (allSame) {
      mult *= cfg.doublesMultiplier;
      res.messages.push(`ゾロ目（${rolls.join('・')}）×${cfg.doublesMultiplier}`);
      rolling = !!cfg.rerollOnDoubles;
    } else {
      rolling = false;
    }
  }
  res.bonus = Math.min(cfg.cap, Math.round(total * cfg.bonusPerPip * mult));
  res.messages.unshift(`サイコロチャンス発動（${fired.join(',')}）→ +${res.bonus}BP`);
  res.diceTarget = cfg.target;
  return res;
}

// ---------------------------------------------------------------------------
// 花牌エフェクト
// ---------------------------------------------------------------------------
/**
 * @param {Object} rules
 * @param {Array} flowers 抜いた花牌（Tile配列）
 * @param {number} playerCount
 */
export function applyFlowerEffects(rules, flowers, playerCount, phase = 'win') {
  const res = empty();
  if (!rules.flowers.enabled || !flowers.length) return res;
  const byId = {};
  for (const f of flowers) {
    const id = f.flower || FLOWER_ID[f.t];
    byId[id] = (byId[id] || 0) + 1;
  }
  const immediate = new Set(['bonusPerTile']);
  for (const [id, n] of Object.entries(byId)) {
    for (const eff of rules.flowers.effects[id] || []) {
      // 「抜いた瞬間」に効く効果と「和了時」に効く効果を混ぜない（二重計上防止）
      if (phase === 'draw' && !immediate.has(eff.type)) continue;
      if (phase === 'win' && immediate.has(eff.type)) continue;
      switch (eff.type) {
        case 'bonusPerTile':
          res.bonus += (eff.value ?? 1) * n * (eff.all ? (playerCount - 1) : 1);
          res.messages.push(`華牌「${labelOf(id)}」即時ボーナス +${(eff.value ?? 1) * n * (eff.all ? playerCount - 1 : 1)}BP`);
          break;
        case 'rankUp':
          res.rankUp += (eff.value ?? 1) * n;
          res.messages.push(`華牌「${labelOf(id)}」打点${(eff.value ?? 1) * n}ランクアップ`);
          break;
        case 'doubleDoraFives':
          res.doubleFives = true;
          res.messages.push(`華牌「${labelOf(id)}」5牌がダブドラ`);
          break;
        case 'alice':
          res.aliceTrigger = (res.aliceTrigger || 0) + (eff.value ?? 1) * n;
          res.messages.push(`華牌「${labelOf(id)}」和了時アリス（×${(eff.value ?? 1) * n}）`);
          break;
        case 'dora': res.extraDora += (eff.value ?? 1) * n; break;
        case 'han': res.extraHan += (eff.value ?? 1) * n; break;
        default: break;
      }
    }
  }
  return res;
}

const labelOf = (id) => ({ spring: '春', summer: '夏', autumn: '秋', winter: '冬' }[id] || id);

// ---------------------------------------------------------------------------
// カスタムルール（WHEN / IF / THEN）
// ---------------------------------------------------------------------------
function factOk(f, ctx) {
  const cmp = (a, op, b) => {
    switch (op) {
      case '>=': return a >= b;
      case '<=': return a <= b;
      case '>': return a > b;
      case '<': return a < b;
      case '!=': return a !== b;
      default: return a === b;
    }
  };
  switch (f.fact) {
    case 'hasTile': {
      const t = codeToType(f.tile);
      const n = ctx.allTiles.filter((x) => x.t === t
        && (f.red === undefined || x.red === f.red)
        && (f.gold === undefined || x.gold === f.gold)).length;
      return cmp(n, f.op || '>=', f.count ?? 1);
    }
    case 'hasSpecial': {
      const n = ctx.allTiles.filter((x) => x.sp === f.id).length;
      return cmp(n, f.op || '>=', f.count ?? 1);
    }
    case 'menzen': return ctx.menzen === (f.value !== false);
    case 'tsumo': return ctx.tsumo === (f.value !== false);
    case 'ron': return ctx.tsumo === !(f.value !== false);
    case 'riichi': return !!ctx.flags.riichi === (f.value !== false);
    case 'ippatsu': return !!ctx.flags.ippatsu === (f.value !== false);
    case 'han': return cmp(ctx.han ?? 0, f.op || '>=', f.value ?? 1);
    case 'yakuman': return cmp(ctx.yakuman ?? 0, f.op || '>=', f.value ?? 1);
    case 'dealer': return ctx.isDealer === (f.value !== false);
    case 'kita': return cmp(ctx.kitaCount ?? 0, f.op || '>=', f.value ?? 1);
    case 'flower': return cmp(ctx.flowerCount ?? 0, f.op || '>=', f.value ?? 1);
    case 'always': return true;
    default: return false;
  }
}

export function runCustomRules(rules, when, ctx, rng) {
  const res = empty();
  for (const rule of rules.customRules || []) {
    if (rule.when !== when) continue;
    if (!(rule.if || [{ fact: 'always' }]).every((f) => factOk(f, ctx))) continue;
    for (const a of rule.then || []) {
      switch (a.action) {
        case 'bonus': res.bonus += a.value ?? 1; break;
        case 'han': res.extraHan += a.value ?? 1; break;
        case 'dora': res.extraDora += a.value ?? 1; break;
        case 'rankUp': res.rankUp += a.value ?? 1; break;
        case 'points': res.points += a.value ?? 0; break;
        case 'dice': mergeInto(res, rollDiceBonus({ ...rules.local.dice, enabled: true, triggers: ['custom'] }, rng, ['custom'])); break;
        case 'message': break;
        default: break;
      }
    }
    res.messages.push(`ハウスルール「${rule.name}」発動`);
  }
  return res;
}

// ---------------------------------------------------------------------------
// 祝儀（ゲーム内ボーナスポイント）集計 — すべて非換金
// ---------------------------------------------------------------------------
/**
 * @returns {number} 和了者が得るボーナス（1人あたり。ツモオール時は人数分を呼び出し側で処理）
 */
export function collectWinBonus(rules, winInfo) {
  const B = rules.bonus;
  if (!B.enabled) return { bonus: 0, detail: [] };
  const detail = [];
  let bonus = 0;
  const add = (v, label) => { if (v) { bonus += v; detail.push(`${label} +${v}`); } };

  if (winInfo.flags.ippatsu) add(B.ippatsu, '一発');
  add(B.ura * (winInfo.uraCount || 0), `裏ドラ×${winInfo.uraCount || 0}`);
  add(B.aka * (winInfo.akaCount || 0), `赤×${winInfo.akaCount || 0}`);
  add(B.gold * (winInfo.goldCount || 0), `金×${winInfo.goldCount || 0}`);
  add(B.pocchi * (winInfo.pocchiCount || 0), `白ポッチ×${winInfo.pocchiCount || 0}`);
  add(B.kita * (winInfo.kitaCount || 0), `北×${winInfo.kitaCount || 0}`);
  if (winInfo.yakuman > 0) {
    const base = B.yakuman * winInfo.yakuman;
    add(winInfo.tsumo ? base : base * B.yakumanRonMultiplier, '役満');
  } else if (winInfo.limitName === '数え役満' || /^\d+倍満$/.test(winInfo.limitName || '')) {
    // 数え役満から先を伸ばすルール（清一色ゲームの5倍満・6倍満…）では
    // 名前が変わる。数え役満と同じ扱いで祝儀を出す。
    add(B.countedYakuman, winInfo.limitName);
  } else if (winInfo.limitName === '三倍満') add(B.sanbaiman, '三倍満');
  return { bonus, detail };
}

export { mergeInto, empty as emptyEffect };
