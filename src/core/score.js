/**
 * score.js - 基本点算出と支払い分配
 * ツモ損 / 丸取り / 割れ目 / 切り上げ満貫 / 数え役満 / 三麻按分 をルール駆動で処理。
 */

const LADDER = [
  { name: '満貫', base: 2000 },
  { name: '跳満', base: 3000 },
  { name: '倍満', base: 4000 },
  { name: '三倍満', base: 6000 },
  { name: '役満', base: 8000 },
];

const ceil100 = (n) => Math.ceil(n / 100) * 100;

/**
 * 基本点を求める。
 * @param {{han:number, fu:number, yakuman:number}} hand
 * @param {Object} rules
 * @param {number} rankUp 打点ランクアップ回数（花牌「夏」など）
 */
export function basePoints(hand, rules, rankUp = 0) {
  const S = rules.scoring;
  let base, name, level = -1;

  // --- 東天紅・ロケット三麻系：点数体系そのものが違うモード
  if (S.mode === 'flat') {
    const F = S.flat;
    if (hand.yakuman > 0) {
      return {
        base: 0, limitName: '役満', level: 4, flat: true,
        pointsPerPayer: F.yakumanPoints * hand.yakuman
          + (hand.nukiCount || 0) * (F.nukiPoints || 0),
      };
    }
    let lv = -1;
    const han = hand.han;
    if (han >= S.countedYakumanHan && S.countedYakuman) lv = 4;
    else if (han >= 11) lv = 3;
    else if (han >= 8) lv = 2;
    else if (han >= 6) lv = 1;
    else if (han >= 5) lv = 0;
    let raw = lv >= 0 ? LADDER[lv].base : F.fuFixed * Math.pow(2, 2 + han);
    if (raw >= 2000) { lv = Math.max(lv, 0); raw = 2000; }
    // 「1翻のみは倍満に昇格」のような下限昇格
    if (han <= (F.promoteMinHan ?? 0)) {
      const idx = { mangan: 0, haneman: 1, baiman: 2, sanbaiman: 3 }[F.promoteTo] ?? 2;
      lv = Math.max(lv, idx);
      raw = LADDER[lv].base;
    }
    for (let i = 0; i < rankUp; i++) {
      lv = Math.min(lv + 1, LADDER.length - 1);
      raw = LADDER[lv].base;
    }
    // 抜き牌（東天紅のガリ）は、和了者の点にそのまま加算される
    const nuki = (hand.nukiCount || 0) * (F.nukiPoints || 0);
    return {
      base: raw, limitName: lv >= 0 ? LADDER[lv].name : '', level: lv, flat: true,
      pointsPerPayer: Math.max(1, Math.round(raw * 4 * F.scale)) + nuki,
    };
  }

  if (hand.yakuman > 0) {
    // 役満は役満どまり（4倍満まで）という店がある。伸びるのは数え役満だけ。
    const cap = S.maxYakumanMultiplier || 0;
    const mult = cap > 0 ? Math.min(hand.yakuman, cap) : hand.yakuman;
    base = 8000 * mult;
    name = mult > 1 ? `${mult}倍役満` : '役満';
    level = 4 + (mult - 1);
  } else {
    const han = hand.han;
    if (han >= S.countedYakumanHan && S.countedYakuman) {
      // 数え役満から先も伸ばすルール（14翻で数え役満、以降2翻ごとに
      // 5倍満・6倍満…）。満貫1つぶん＝2000点ずつ増える。
      const step = S.countedYakumanStepHan || 0;
      const up = step > 0 ? Math.floor((han - S.countedYakumanHan) / step) : 0;
      base = 8000 + 2000 * up;
      name = up > 0 ? `${4 + up}倍満` : '数え役満';
      level = 4 + up;
    }
    else if (han >= 11) { base = 6000; name = '三倍満'; level = 3; }
    else if (han >= 8) { base = 4000; name = '倍満'; level = 2; }
    else if (han >= 6) { base = 3000; name = '跳満'; level = 1; }
    else if (han >= 5) { base = 2000; name = '満貫'; level = 0; }
    else {
      const raw = hand.fu * Math.pow(2, 2 + han);
      if (raw >= 2000 || (S.roundUpMangan && raw >= 1920)) { base = 2000; name = '満貫'; level = 0; }
      else { base = raw; name = ''; level = -1; }
    }
  }

  for (let i = 0; i < rankUp; i++) {
    level = Math.min(level + 1, LADDER.length - 1);
    base = LADDER[level].base;
    name = LADDER[level].name;
  }
  return { base, limitName: name, level };
}

/**
 * 和了時の点棒移動を計算する。
 * @returns {{deltas:number[], detail:Object}}
 */
export function settleWin({
  base, winner, loser, tsumo, dealerSeat, playerCount, rules, honba, kyotaku, wareme,
  pointsPerPayer = null,
}) {
  const S = rules.scoring;
  const W = rules.local.wareme;
  const deltas = new Array(playerCount).fill(0);
  const isDealer = winner === dealerSeat;
  const flat = S.mode === 'flat' && pointsPerPayer != null;
  const round = flat ? ((n) => Math.round(n)) : ceil100;
  const pay = (from, to, amount) => {
    let a = amount;
    if (W.enabled && (W.allPlayers || (wareme != null && (from === wareme || to === wareme)))) {
      a = a * (W.multiplier ?? 2);
    }
    a = round(a);
    deltas[from] -= a;
    deltas[to] += a;
    return a;
  };

  const detail = { payments: [], honba, kyotaku, flat };

  // --- 東天紅系：ロンは1人分、ツモは各支払者が1人分ずつ（＝2人分）
  if (flat) {
    const honbaPer = honba * (S.flat.honbaPoints || 0);
    if (!tsumo) {
      const paid = pay(loser, winner, pointsPerPayer + honbaPer);
      detail.payments.push({ from: loser, to: winner, amount: paid });
    } else {
      for (let s = 0; s < playerCount; s++) {
        if (s === winner) continue;
        const paid = pay(s, winner, pointsPerPayer + honbaPer);
        detail.payments.push({ from: s, to: winner, amount: paid });
      }
    }
    if (kyotaku > 0) {
      deltas[winner] += kyotaku * S.riichiStick;
      detail.kyotakuGain = kyotaku * S.riichiStick;
    }
    return { deltas, detail };
  }

  if (!tsumo) {
    const mult = isDealer ? 6 : 4;
    const honbaAmount = honba * 100 * (playerCount - 1);
    const amount = ceil100(base * mult) + (W.honbaExempt ? 0 : honbaAmount);
    const paid = pay(loser, winner, amount) + (W.honbaExempt ? honbaAmount : 0);
    if (W.honbaExempt && honbaAmount) { deltas[loser] -= honbaAmount; deltas[winner] += honbaAmount; }
    detail.payments.push({ from: loser, to: winner, amount: paid });
  } else {
    // 4人麻雀基準の取り分
    const shares = [];
    for (let s = 0; s < playerCount; s++) {
      if (s === winner) continue;
      shares.push({ seat: s, mult: isDealer ? 2 : (s === dealerSeat ? 2 : 1) });
    }
    let totalMult = isDealer ? 6 : 4;
    const presentMult = shares.reduce((a, b) => a + b.mult, 0);
    const noLoss = !rules.sanma.tsumoLoss; // ツモ損なし（丸取り）
    let scale = 1;
    if (playerCount === 3) {
      if (noLoss) scale = totalMult / presentMult;
      else totalMult = presentMult;
    }
    for (const sh of shares) {
      const amount = ceil100(base * sh.mult * scale) + honba * 100;
      const paid = pay(sh.seat, winner, amount);
      detail.payments.push({ from: sh.seat, to: winner, amount: paid });
    }
  }

  if (kyotaku > 0) {
    deltas[winner] += kyotaku * S.riichiStick;
    detail.kyotakuGain = kyotaku * S.riichiStick;
  }
  return { deltas, detail };
}

/** 流局時のノーテン罰符 */
export function settleNoten(tenpaiSeats, playerCount, rules) {
  const deltas = new Array(playerCount).fill(0);
  const total = rules.ryuukyoku.notenPenalty;
  const n = tenpaiSeats.length;
  if (n === 0 || n === playerCount || total === 0) return deltas;
  const receive = Math.floor(total / n / 100) * 100;
  const paySide = playerCount - n;
  const payEach = Math.floor((receive * n) / paySide / 100) * 100;
  for (let s = 0; s < playerCount; s++) {
    if (tenpaiSeats.includes(s)) deltas[s] += receive;
    else deltas[s] -= payEach;
  }
  return deltas;
}

/**
 * 順位点（ウマ・オカ）を含む最終精算。
 * 沈みウマ（返し点未満で追加マイナス）も rules.scoring.shizumiUma で対応。
 */
export function finalScores(points, rules) {
  const S = rules.scoring;
  const n = points.length;
  const order = points.map((p, seat) => ({ seat, p }))
    .sort((a, b) => (b.p - a.p) || (a.seat - b.seat));
  const round1 = (v) => Math.round(v * 10) / 10;

  // 各順位のウマ（沈みウマ補正込み）。トップは合計ゼロサムで確定させる。
  const umas = order.map((o, rank) => {
    let u = S.uma[rank] ?? 0;
    if (S.shizumiUma && rank > 0 && o.p < S.returnPoints) u += S.shizumiUmaValue ?? 0;
    return u;
  });
  if (S.umaZeroSum) {
    umas[0] = -umas.slice(1).reduce((a, b) => a + b, 0);
  }

  const oka = ((S.returnPoints - S.startingPoints) * n) / 1000;
  // 東天紅系（flat）は点そのものが成績。1000で割らない。
  const divisor = S.mode === 'flat' ? 1 : 1000;

  /**
   * 素点の丸め。フリー雀荘では五捨六入（500点以下は切り捨て・600点以上は切り上げ）が多い。
   * 単位は「点数 ÷ 1000」後の値なので、0.5 を境に見る。
   */
  const roundRaw = (v) => {
    const mode = S.rawRounding || 'none';
    if (mode === 'none' || divisor === 1) return v;
    if (mode === 'ceil') return v >= 0 ? Math.ceil(v) : -Math.ceil(-v);
    if (mode === 'floor') return v >= 0 ? Math.floor(v) : -Math.floor(-v);
    // 五捨六入：絶対値の小数部が 0.5 以下なら捨て、0.6 以上なら上げる
    const sign = v < 0 ? -1 : 1;
    const a = Math.abs(v);
    const int = Math.floor(a);
    const frac = Math.round((a - int) * 10) / 10;
    const rounded = sign * (frac <= 0.5 ? int : int + 1);
    return rounded === 0 ? 0 : rounded;  // -0 を作らない
  };

  const K = S.kubi || {};
  return order.map((o, rank) => {
    const raw = S.rankOnly ? 0 : roundRaw((o.p - S.returnPoints) / divisor);
    let total = raw + umas[rank];
    if (!S.rankOnly && S.okaToTop && rank === 0) total += oka;
    // クビ：規定点に届かなければスコアから引く
    let kubi = 0;
    if (K.enabled && o.p < (K.threshold ?? 0) && !(K.exceptTop && rank === 0)) {
      kubi = K.penalty ?? 0;
      total += kubi;
    }
    return {
      seat: o.seat, rank: rank + 1, points: o.p,
      raw: round1(raw), uma: umas[rank], kubi, total: round1(total),
    };
  });
}

export { LADDER, ceil100 };
