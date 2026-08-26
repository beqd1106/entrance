/**
 * presets.js - ルールプリセット
 *
 * 各プリセットは「既定値からの差分」だけを持つ。
 * 店舗プリセットも同じ形なので、店舗設定を差し替えるだけで挙動が変わる。
 */

/** 五等サンマ系の共通ベース（特定店舗の再現ではなく、系統としての骨格） */
const GOTO_BASE = {
  game: {
    players: 3, length: 'east', tobiEnd: true, tobiZeroIsEnd: true,
    agariYame: false, tenpaiYame: false, maxKyoku: 16,
  },
  scoring: {
    startingPoints: 35000, returnPoints: 40000,
    honbaPoints: 2000,
    useFu: false, roundUpMangan: true,
    countedYakuman: true, countedYakumanHan: 13,
    uma: [0, 0, -20], rankOnly: true, umaZeroSum: true,
    shizumiUma: true, shizumiUmaValue: -10,
  },
  renchan: { dealerRepeat: 'tenpai' },
  // ノーテン罰符は場に4000点、本場は1本2000点。
  // 四麻の3000点・300点より重く、五等サンマの動きの速さを作っている。
  ryuukyoku: { notenPenalty: 4000, nagashiMangan: false },
  sanma: {
    removeManzu: true, northMode: 'nuki', kitaIsDora: true,
    northIsYakuhai: false, northRonOk: false, kitaBonus: 1, tsumoLoss: true,
    // 北は抜かずに手牌へ残してもよい（役牌にはならない）。
    // 国士だけに限る店もあるが、ここでは制限しない＝実際の動きに合わせた値。
    kitaUsableInHand: 'always',
  },
  dora: {
    indicators: 2, ura: true, kanDora: true, kanUra: true,
    // 5筒・5索は「赤金黒黒」＝4枚のうち赤1枚・金1枚・ふつうの牌2枚
    red: { '5p': 1, '5s': 1 }, gold: { '5p': 1, '5s': 1 }, goldIsDora: true,
    // 華牌が表示牌に出たらめくり直す。華牌はツモった瞬間に抜かれるので、
    // そのままだと誰も持てないドラになり、表示牌が1枚まるごと死ぬ。
    flowerIndicatorEffect: 'redraw',
  },
  flowers: {
    enabled: true,
    // 華牌は自分でタップして抜く。抜く間合いも打ち手の判断のうち、
    // という店が多い（勝手に抜けると、抜くかどうかを選べない）
    manualDraw: true,
    tiles: ['spring', 'summer', 'autumn', 'winter'],
    isDora: false,
    effects: {
      spring: [{ type: 'bonusPerTile', value: 1, all: true }],
      summer: [{ type: 'rankUp', value: 1 }],
      autumn: [{ type: 'doubleDoraFives' }],
      winter: [{ type: 'alice', value: 2 }],
    },
  },
  local: {
    shiroPocchi: { enabled: true, count: 1, mode: 'both', almightyCondition: 'riichi_tsumo', bonus: 1 },
    yakitori: { enabled: true, penalty: 5 },
    tobiBonus: { enabled: true, value: 2 },
    dice: {
      enabled: true, count: 2,
      triggers: ['yakuman', 'countedYakuman', 'fourKita', 'fourFlower', 'pocchiTsumo'],
      rerollOnDoubles: true, doublesMultiplier: 2, pinzoroMultiplier: 10,
      bonusPerPip: 1, target: 'winner', cap: 100,
    },
  },
  bonus: {
    enabled: true, label: 'BP（ゲーム内ポイント・非換金）',
    ippatsu: 1, ura: 1, aka: 1, gold: 1, pocchi: 1, kita: 1,
    sanbaiman: 3, countedYakuman: 5, yakuman: 10, yakumanRonMultiplier: 2, tsumoAll: true,
  },
};

const deep = (a, b) => {
  if (b === undefined) return a;
  if (typeof a !== 'object' || a === null || Array.isArray(a) || Array.isArray(b)) return b;
  const o = { ...a };
  for (const k of Object.keys(b)) o[k] = deep(a[k], b[k]);
  return o;
};

export const PRESETS = [
  // ---------------- 四麻系 ----------------
  {
    id: 'standard4',
    name: '一般四麻',
    category: '標準',
    tags: ['四麻', '赤あり', '喰いタンあり'],
    description: 'フリー雀荘で最も普及している東南戦。25000持ち30000返し（オカ20）・ウマ5-10・赤3枚・喰いタンあり後付けあり。',
    rules: { meta: { id: 'standard4', name: '一般四麻' } },
  },
  {
    id: 'competition4',
    name: '競技ルール風',
    category: '標準',
    tags: ['四麻', '赤なし', '一発裏なし', 'オカなし'],
    description: '一発・裏ドラ・赤牌なし。30000持ち30000返しでオカなし、順位点は30-10。'
      + '喰いタン・後付けあり、切り上げ満貫なし、西入あり。'
      + '（最高位戦・日本プロ麻雀協会系の並び。連盟Aルールは喰いタンなし）',
    rules: {
      meta: { id: 'competition4', name: '競技ルール風' },
      scoring: { startingPoints: 30000, returnPoints: 30000, uma: [30, 10, -10, -30], okaToTop: false, roundUpMangan: false },
      // 一発は役としても採らない。裏ドラを切るだけでは「一発なし」にならない
      win: { ippatsu: false },
      dora: { red: {}, ura: false, kanUra: false },
      local: { openRiichi: { enabled: false } },
      bonus: { enabled: false },
      game: { agariYame: false, tobiEnd: false, westEntry: true },
    },
  },
  {
    id: 'mleague4',
    name: 'Mリーグ風',
    category: '標準',
    tags: ['四麻', '赤3', 'トビなし', '途中流局なし', '頭ハネ'],
    description: '25000持ち30000返し・ウマ10-30・赤3枚・トビなし・西入なし。'
      + '途中流局なし、流し満貫なし、ダブロンなしの頭ハネ、切り上げ満貫あり、数え役満なし（11翻以上は三倍満止まり）。',
    rules: {
      meta: { id: 'mleague4', name: 'Mリーグ風' },
      scoring: {
        uma: [30, 10, -10, -30], okaToTop: true,
        // 切り上げ満貫はあり。数え役満は採らず、11翻以上は三倍満で頭打ち
        roundUpMangan: true, countedYakuman: false,
      },
      game: { tobiEnd: false, agariYame: true, westEntry: false },
      // ダブロンは採らず頭ハネ。流し満貫も無い
      win: { doubleRon: false },
      ryuukyoku: { nagashiMangan: false },
      // 途中流局はいっさい無い（九種九牌・四風連打・四家立直・四開槓）
      renchan: {
        kyuushuKyuuhai: false, suufonRenda: false,
        suukaikan: false, suuchaRiichi: false,
      },
      dora: { red: { '5m': 1, '5p': 1, '5s': 1 } },
      bonus: { enabled: false },
    },
  },
  // ---------------- 三麻系 ----------------
  {
    id: 'standard3',
    name: '一般三麻',
    category: '標準',
    tags: ['三麻', '北抜き', 'ツモ損なし'],
    description: '35000持ち40000返しの三人麻雀。萬子2〜8抜き・北は抜きドラ・ツモ損なし。'
      + '本場は1本1000点、ノーテン罰符は場に2000点（三麻は四麻より重い刻みが一般的）。',
    rules: {
      meta: { id: 'standard3', name: '一般三麻' },
      game: { players: 3, length: 'east_south' },
      // 三麻は本場もノーテン罰符も四麻より重い。四麻の既定（300/3000）は合わない
      scoring: { startingPoints: 35000, returnPoints: 40000, uma: [15, -5, -10], honbaPoints: 1000 },
      ryuukyoku: { notenPenalty: 2000 },
      sanma: { tsumoLoss: false },
      dora: { red: { '5p': 1, '5s': 1 } },
    },
  },
  {
    id: 'kanto3',
    name: '関東三麻風',
    category: '地域',
    tags: ['三麻', 'ツモ損あり', '東風'],
    description: '東風戦・ツモ損あり・北は抜きドラ。テンポの速い関東系の三麻。'
      + '本場は1本1000点、ノーテン罰符は場に2000点。ツモ損は1000点以下を切り上げ。',
    rules: {
      meta: { id: 'kanto3', name: '関東三麻風' },
      game: { players: 3, length: 'east' },
      scoring: { startingPoints: 35000, returnPoints: 40000, uma: [15, -5, -10], honbaPoints: 1000 },
      ryuukyoku: { notenPenalty: 2000 },
      sanma: { tsumoLoss: true },
      dora: { red: { '5p': 1, '5s': 1 } },
    },
  },
  {
    id: 'kansai3',
    name: '関西三麻風',
    category: '地域',
    tags: ['三麻', '北役牌', '花牌抜き', '平和ツモなし'],
    description: '関西のサンマフリー系。北は役牌として手に使い、抜きドラは花牌のほう。'
      + '35000持ち40000返し・ウマ30/-10/-20・本場1000点・オープンリーチあり・ツモ損なし。'
      + '平和とツモは複合せず、山はドラ表示牌の隣まで引ききります。',
    rules: {
      meta: { id: 'kansai3', name: '関西三麻風' },
      game: { players: 3, length: 'east' },
      scoring: {
        startingPoints: 35000, returnPoints: 40000,
        // 1位+30 / 2位-10 / 3位-20（沈みを重く見る関西式）
        uma: [30, -10, -20],
        honbaPoints: 1000,
      },
      // 萬子2〜8を抜いた27種108枚が土台。北は役牌として手に使う
      sanma: {
        removeManzu: true, manzuKeep: ['1m', '9m'],
        northMode: 'yakuhai', northIsYakuhai: true, kitaIsDora: false, tsumoLoss: false,
      },
      // 抜きドラは花牌のほう。ドラが増えるだけで、五等サンマのような効果は無い
      flowers: { enabled: true, isDora: true, effects: {} },
      // 平和ツモは認めない
      win: { pinfuTsumo: false },
      // オープンリーチあり（供託は2000点）
      local: { openRiichi: { enabled: true, han: 1, bonus: 1 } },
      // 「ドラの真横まで引く」ため王牌が薄い。1局に打てる巡目が増える
      wall: { deadWallSize: 8 },
      // 華牌が表示牌に出たらめくり直す（そのままだと誰も持てないドラになる）
      dora: { red: { '5p': 1, '5s': 1 }, flowerIndicatorEffect: 'redraw' },
    },
  },
  // ---------------- 特殊ルール体験 ----------------
  {
    id: 'alice_demo',
    name: 'アリス体験',
    category: '特殊',
    tags: ['四麻', 'アリス', '祝儀'],
    description: '一般四麻＋アリス。門前和了時にドラ表示牌の隣をめくり、手牌と一致する限りBPが伸びる。',
    rules: {
      meta: { id: 'alice_demo', name: 'アリス体験' },
      local: {
        alice: {
          enabled: true, requireMenzen: true, requireRiichi: false, start: 'nextDora',
          matchTarget: 'hand', matchMode: 'exact', continueOnMatch: true, maxFlips: 4,
          bonusPerMatch: 1, kotsuMode: 'each', max: 12,
        },
      },
    },
  },
  {
    id: 'tulip_demo',
    name: 'チューリップ体験',
    category: '特殊',
    tags: ['四麻', 'チューリップ', '祝儀'],
    description: 'アリスの拡張版。めくった牌の「現物＋両隣」まで一致扱いになるため成立率が大幅に上がる。',
    rules: {
      meta: { id: 'tulip_demo', name: 'チューリップ体験' },
      local: {
        tulip: {
          enabled: true, requireMenzen: true, start: 'nextDora',
          matchTarget: 'hand', matchMode: 'tulip', continueOnMatch: true, maxFlips: 4,
          bonusPerMatch: 1, kotsuMode: 'one', max: 12,
        },
      },
    },
  },
  {
    id: 'wareme_demo',
    name: '割れ目体験',
    category: '特殊',
    tags: ['四麻', '割れ目', 'オープンリーチ'],
    description: 'サイコロで決まった1人の収支が2倍になる割れ目ルール。オープンリーチも採用。',
    rules: {
      meta: { id: 'wareme_demo', name: '割れ目体験' },
      local: {
        wareme: { enabled: true, multiplier: 2 },
        openRiichi: { enabled: true, han: 1, bonus: 1 },
      },
    },
  },
  {
    id: 'special_tiles_demo',
    name: '特殊牌体験',
    category: '特殊',
    tags: ['四麻', '特殊牌', '白ポッチ'],
    description: '牌ごとに異なる効果を持つ特殊牌ルール。青5索・銀5筒・翠發などを1セットで体験できる。',
    rules: {
      meta: { id: 'special_tiles_demo', name: '特殊牌体験' },
      local: { shiroPocchi: { enabled: true, count: 1, mode: 'both', bonus: 2 } },
      specialTiles: [
        {
          id: 'blue5s', name: '青5索', tile: '5s', count: 1, color: 'blue',
          effects: [{ type: 'bonus', value: 2 }], conditions: {},
        },
        {
          id: 'silver5p', name: '銀5筒', tile: '5p', count: 1, color: 'silver',
          effects: [{ type: 'dora', value: 2 }], conditions: {},
        },
        {
          id: 'emerald5m', name: '翠5萬', tile: '5m', count: 1, color: 'green',
          effects: [{ type: 'han', value: 1 }, { type: 'bonus', value: 1 }], conditions: { menzenOnly: true },
        },
        {
          id: 'topaz_haku', name: '琥珀白', tile: '5z', count: 1, color: 'gold',
          effects: [{ type: 'almighty' }, { type: 'bonus', value: 3 }],
          conditions: { tsumoOnly: true, riichiOnly: true },
        },
      ],
      customRules: [
        {
          id: 'jewel_combo', name: 'ジュエルコンボ（青5索＋銀5筒）', when: 'win',
          if: [{ fact: 'hasSpecial', id: 'blue5s' }, { fact: 'hasSpecial', id: 'silver5p' }],
          then: [{ action: 'bonus', value: 5 }, { action: 'rankUp', value: 1 }],
        },
      ],
    },
  },
  // ---------------- 点数体系そのものが異なる系統 ----------------
  {
    id: 'toutenkou3',
    name: '東天紅風',
    category: '地域',
    tags: ['三麻', '東天紅', '常に東場', 'ガリ'],
    description: '関東発の三人麻雀。点数の単位が「翻」ではなく「点」で、ロンは1人分・ツモは2人分。'
      + '一萬五萬九萬と北がガリ（抜きドラ）で1枚1点。役満は50点、ノーテン罰符は場に10点。'
      + '常に東場で、前局の和了者が次局の親になります。'
      + '※東天紅は店ごとの差がとくに大きく、ガリを1枚4点・役満を100点とする店もあります。ここは基本形に合わせています。',
    rules: {
      meta: { id: 'toutenkou3', name: '東天紅風' },
      game: {
        players: 3, length: 'east', alwaysEast: true, dealerRule: 'winner',
        tobiEnd: false, hakoshita: true, agariYame: false, maxKyoku: 16,
      },
      scoring: {
        startingPoints: 0, returnPoints: 0, uma: [0, 0, 0], okaToTop: false,
        useFu: false, mode: 'flat', riichiStick: 1,
        flat: {
          fuFixed: 30, scale: 0.001, yakumanPoints: 50,
          promoteMinHan: 0, honbaPoints: 5, tsumoIsDouble: true,
          // ガリ（一萬・五萬・九萬・北の抜き）は1枚1点。
          // 役満50点・ノーテン罰符10点と釣り合う基本形の値。
          // 1枚4点（役満100点）とする店もあるが、混ぜると割に合わなくなる。
          nukiPoints: 1,
        },
      },
      ryuukyoku: { notenPenalty: 10, nagashiMangan: false },
      renchan: { dealerRepeat: 'none' },
      sanma: {
        removeManzu: true, manzuKeep: ['1m', '5m', '9m'],
        northMode: 'nuki', kitaIsDora: true, tsumoLoss: false,
        extraNukiTiles: ['1m', '5m', '9m'], kitaBonus: 0,
      },
      // 東天紅では筒子・索子の5が常時ドラ（赤牌を入れる店もある）
      dora: { indicators: 1, permanentDora: ['5p', '5s'], red: {}, gold: {} },
      // 焼き鳥（一度も和了できなかった人への罰）は、東天紅の決まりとしては
      // はっきりした出典が無いので入れない。カラス（ガリもドラも無い和了に
      // 点が付く）も、点をそのまま足すしくみが要るため今回は見送る。
      bonus: {
        enabled: true, label: 'BP（ゲーム内ポイント・非換金）',
        ippatsu: 1, ura: 1, aka: 0, gold: 0, pocchi: 0, kita: 0,
        sanbaiman: 2, countedYakuman: 3, yakuman: 5,
      },
    },
  },
  {
    id: 'rocket3',
    name: 'ロケット三麻風',
    category: '五等サンマ',
    tags: ['三麻', 'インフレ', 'ロケット牌', '華牌'],
    description: '東天紅系の点数体系にインフレ要素を足した三麻。40符固定・1翻でも倍満扱い・常時ドラ2枚・金牌とロケット牌・華牌の効果つき。',
    rules: {
      meta: { id: 'rocket3', name: 'ロケット三麻風' },
      game: {
        players: 3, length: 'east', alwaysEast: true, dealerRule: 'winner',
        tobiEnd: false, agariYame: false, maxKyoku: 16,
      },
      scoring: {
        startingPoints: 0, returnPoints: 0, uma: [0, 0, 0], okaToTop: false,
        useFu: false, mode: 'flat', riichiStick: 1,
        flat: {
          fuFixed: 40, scale: 0.001, yakumanPoints: 32,
          promoteMinHan: 1, promoteTo: 'baiman', honbaPoints: 5, tsumoIsDouble: true,
        },
      },
      ryuukyoku: { notenPenalty: 10, nagashiMangan: false },
      renchan: { dealerRepeat: 'none' },
      sanma: { removeManzu: true, northMode: 'nuki', kitaIsDora: true, tsumoLoss: false, kitaBonus: 0 },
      dora: {
        indicators: 2, red: {}, gold: { '5p': 1, '5s': 1 }, goldIsDora: true,
        // 華牌が表示牌に出たらめくり直す（そのままだと誰も持てないドラになる）
        flowerIndicatorEffect: 'redraw',
      },
      flowers: {
        enabled: true, tiles: ['spring', 'summer', 'autumn', 'winter'], isDora: false,
        effects: {
          spring: [{ type: 'bonusPerTile', value: 5, all: true }],
          // 夏は「役が昇格」だけでなく、抜いた時点で20点が付く
          summer: [{ type: 'rankUp', value: 1 }, { type: 'bonusPerTile', value: 20 }],
          // 秋は金牌・ロケット牌がダブドラ。どちらも5筒5索に置いてあるので、
          // 「5牌をダブドラ」で同じことになる
          autumn: [{ type: 'doubleDoraFives' }],
          winter: [{ type: 'alice', value: 5 }],
        },
      },
      local: {
        shiroPocchi: { enabled: true, count: 1, mode: 'both', almightyCondition: 'riichi_tsumo', bonus: 5 },
        dice: {
          enabled: true, count: 2,
          triggers: ['yakuman', 'countedYakuman', 'fourKita', 'fourFlower', 'pocchiTsumo'],
          rerollOnDoubles: true, doublesMultiplier: 2, pinzoroMultiplier: 4,
          bonusPerPip: 5, target: 'winner', cap: 200,
        },
        yakitori: { enabled: true, penalty: 10 },
      },
      specialTiles: [
        {
          id: 'rocket_p', name: 'ロケット5筒', tile: '5p', count: 1, color: 'rainbow',
          activationTiming: 'win', description: '和了時に大きなボーナス',
          effects: [{ type: 'bonus', value: 20 }], conditions: {},
        },
        {
          id: 'rocket_s', name: 'ロケット5索', tile: '5s', count: 1, color: 'rainbow',
          activationTiming: 'win', effects: [{ type: 'bonus', value: 20 }], conditions: {},
        },
        {
          id: 'rocket_kita', name: 'ロケット北', tile: '4z', count: 1, color: 'rainbow',
          activationTiming: 'win', effects: [{ type: 'bonus', value: 20 }], conditions: {},
        },
      ],
      bonus: {
        enabled: true, label: 'BP（ゲーム内ポイント・非換金）',
        ippatsu: 5, ura: 5, aka: 5, gold: 5, pocchi: 5, kita: 0,
        sanbaiman: 10, countedYakuman: 15, yakuman: 15, yakumanRonMultiplier: 1, tsumoAll: false,
      },
    },
  },
  {
    id: 'zenaka3',
    name: '全赤三麻風',
    category: '特殊',
    tags: ['三麻', '全赤', 'インフレ'],
    description: '5がすべて赤牌の三人麻雀。常に打点が高く、短時間で大きく動きます。',
    rules: {
      meta: { id: 'zenaka3', name: '全赤三麻風' },
      game: { players: 3, length: 'east' },
      scoring: {
        startingPoints: 35000, returnPoints: 40000, uma: [15, -5, -10],
        roundUpMangan: true, honbaPoints: 1000,
      },
      ryuukyoku: { notenPenalty: 2000 },
      sanma: { tsumoLoss: false },
      dora: { indicators: 1, red: { '5p': 4, '5s': 4 } },
      bonus: { enabled: true, label: 'BP（ゲーム内ポイント・非換金）', aka: 1 },
    },
  },
  {
    id: 'mighty3',
    name: '少牌マイティ風',
    category: '特殊',
    tags: ['三麻', '少牌マイティ', '高速'],
    description: '手牌が常に1枚少なく、足りない1枚は何にでもなる牌として扱います。テンパイ形がそのまま和了になるので、驚くほど速く決着します。'
      + '東南戦・テンパイ連荘、30,000点持ち30,000点返し、本場は場に200点、赤なし・裏なし・抜きドラなし、北は共通役牌。'
      + 'オープンリーチあり、4枚使い七対子あり。大車輪・萬子混一色は役満。'
      + '※「無」（4副露完了で役満）は未実装です。',
    rules: {
      meta: { id: 'mighty3', name: '少牌マイティ風' },
      // 公式ルールは東南戦・テンパイ連荘
      game: { players: 3, length: 'east_south' },
      renchan: { dealerRepeat: 'tenpai' },
      local: {
        shouhaiMighty: { enabled: true, count: 1 },
        // 4枚使い七対子あり
        chiitoiMultiPair: true,
        // オープンリーチあり（全開け）
        openRiichi: { enabled: true, revealMode: 'all' },
      },
      scoring: {
        startingPoints: 30000, returnPoints: 30000, uma: [15, -5, -10],
        // 符計算あり・1000おきに切り上げ。本場は場に200点（8000は8200）
        roundUpMangan: true, honbaPoints: 200,
      },
      // 北は抜かずに共通の役牌として使う
      sanma: {
        tsumoLoss: false,
        northMode: 'yakuhai', northIsYakuhai: true, kitaIsDora: false,
      },
      // 赤5筒・赤5索なし、裏ドラなし
      dora: { indicators: 1, ura: false, red: {} },
      // 公式ルールで採用されている役
      localYaku: [
        // 大車輪。三麻なので、2〜8に限らず清一色の七対子はすべて認める
        { id: 'daisharin', enabled: true, yakuman: 1, scope: 'chinitsu' },
        // 萬子の混一色
        { id: 'manzuhonitsu', enabled: true, yakuman: 1 },
        // お多福（5面待ち以上で、待ちの種類ぶん翻が増える）
        { id: 'otafuku', enabled: true },
      ],
      bonus: { enabled: true, label: 'BP（ゲーム内ポイント・非換金）' },
    },
  },
  {
    id: 'chinitsu3',
    name: '清一色ゲーム風',
    category: '特殊',
    tags: ['三麻', '清一色ゲーム', '2セット混ぜ', '1種8枚', '色が交互'],
    description: '全自動卓の2セットを混ぜて打つ三人麻雀。萬子は使わず、筒子だけの回と索子だけの回を交互に打ちます。'
      + 'その色を1種8枚入れるので、手はいつも清一色。牌の裏が青と黄の2色になり、裏がそろうと背一色（役満）。'
      + 'カンは4回で打ち切らず、カンした牌の5枚目以降も足せます（足すたびにドラが増えます）。'
      + '七対子はそろえば大車輪（役満）。2〜8に限らず、清一色の七対子ならすべて認めます。'
      + '14翻で数え役満、以降2翻ごとに5倍満・6倍満…と伸びますが、本物の役満は役満どまりです。',
    rules: {
      meta: { id: 'chinitsu3', name: '清一色ゲーム風' },
      game: { players: 3, length: 'east' },
      // 萬子は1枚も使わない。関西サンマがベースなので北は抜かずに役牌として使う。
      sanma: {
        removeManzu: true, manzuKeep: [],
        northMode: 'yakuhai', northIsYakuhai: true, kitaIsDora: false, tsumoLoss: false,
      },
      wall: {
        // 筒子だけの回と索子だけの回を交互に打つ（卓の牌そのものを入れ替える）
        suitRotation: ['p', 's'],
        // 2セット分なので数牌は1種8枚。字牌は色で分からないよう各色2枚ずつ＝1種4枚。
        // 数牌9種×8＋字牌7種×4＝100枚。
        tileCounts: { p: 8, s: 8 },
        // 2セット混ぜなので牌の裏が青と黄の2色になる（背一色の判定に使う）
        backColors: { enabled: true, colors: ['blue', 'yellow'] },
      },
      scoring: {
        startingPoints: 35000, returnPoints: 40000,
        uma: [0, 1, -3], umaZeroSum: true, roundUpMangan: true,
        // 14翻で数え役満。以降は2翻ごとに5倍満・6倍満・7倍満…と伸びる。
        // 伸びるのは数え役満だけで、本物の役満は役満どまり（4倍満まで）。
        countedYakumanHan: 14, countedYakumanStepHan: 2,
        maxYakumanMultiplier: 1,
      },
      // 5筒・5索はすべてドラ。赤2枚・金2枚は祝儀牌として残す。
      dora: {
        indicators: 1,
        permanentDora: ['5p', '5s'],
        red: { '5p': 1, '5s': 1 }, gold: { '5p': 1, '5s': 1 },
      },
      ryuukyoku: { notenPenalty: 6000 },
      // 牌の構成のせいで途中流局が起きすぎるので、両方とも流さない。
      //   ・同じ牌が8枚あるのでカンは5回以上できる（四開槓で流さない）
      //   ・1色だけなので全員がすぐテンパイする。全員立直でも流さない
      //     （これを残すと16%の局が三人立直で流れて対局にならなかった）
      renchan: { suukaikan: false, suuchaRiichi: false },
      // 同じ牌が8枚あるので、七対子の8枚使いを認める
      local: { chiitoiMultiPair: true },
      // カンは4回で打ち切らない。すでにカンした牌の5枚目以降も足せる
      // （足すたびにドラ表示牌が増える。無くなったら山から取る）
      win: { kanBeyondFour: true },
      // 役満は役満どまりのルールなので、どちらも1倍で持つ。
      // 大車輪はこの店では既定で入っている（1色しか使わないので狙える）。
      // 筒子の回は大車輪、索子の回は大竹林として成立する。
      localYaku: [
        { id: 'seiiisou', enabled: true, yakuman: 1 },
        // 1色しか使わない卓なので、清一色の七対子はすべて大車輪として扱う
        { id: 'daisharin', enabled: true, yakuman: 1, scope: 'chinitsu' },
      ],
      // 役満の祝儀はツモ25枚オール・出50枚。
      // 供託は本数、祝儀は枚数で数える。ツモは全員が枚数ぶん払い（tsumoAll）、
      // ロンは放銃者が2倍払う（25×2＝50枚）。
      bonus: {
        enabled: true, label: 'BP（ゲーム内ポイント・非換金）', aka: 1, gold: 2,
        yakuman: 25, yakumanRonMultiplier: 2, tsumoAll: true,
      },
    },
  },
  {
    id: 'bakudora4',
    name: '爆ドラ四麻風',
    category: '特殊',
    tags: ['四麻', '爆ドラ', '青牌', '金牌'],
    description: '表ドラ表示牌を3枚めくる爆ドラ設定。青5索はドラ1枚分、金5筒はドラ2枚分として数えます。',
    rules: {
      meta: { id: 'bakudora4', name: '爆ドラ四麻風' },
      game: { players: 4, length: 'east' },
      scoring: { roundUpMangan: true, countedYakumanHan: 11 },
      dora: {
        indicators: 1, bakuDora: 2,
        red: { '5m': 1, '5p': 1, '5s': 1 },
        gold: { '5p': 1 }, blue: { '5s': 1 },
        attributeDora: { red: 1, gold: 2, blue: 1, star: 1, rainbow: 3 },
      },
      bonus: { enabled: true, label: 'BP（ゲーム内ポイント・非換金）', aka: 1, gold: 2 },
    },
  },
  {
    id: 'jewel4',
    name: 'ジュエル風',
    category: '特殊',
    tags: ['四麻', '宝石牌', 'ジュエル', '祝儀重視'],
    description: '新宿の宝石牌ルール系。5の牌に宝石牌を5種類入れ、どれもドラ＋祝儀。'
      + '3種類以上そろえて和了ると「ジュエル」（1翻）、全種類そろえると「宝石箱」（役満）。'
      + '25,500持ち30,000返し・ウマ10-3・オープンリーチあり（供託2000）・流し満貫あり。'
      + '※店によって入れる宝石牌の顔ぶれが変わります（各色2枚まで）。',
    rules: {
      meta: { id: 'jewel4', name: 'ジュエル風' },
      game: { players: 4, length: 'east_south', tobiEnd: true },
      scoring: {
        startingPoints: 25500, returnPoints: 30000,
        // 完全順位制のときの刻み（1位+10 / 2位+3 / 3位-3 / 4位-10）
        uma: [10, 3, -3, -10], okaToTop: true, roundUpMangan: true,
      },
      // フリテンリーチ可・流し満貫あり・役満は複合する
      win: { furitenRiichi: true },
      ryuukyoku: { nagashiMangan: true },
      // オープンリーチあり（供託は2000点）
      local: {
        openRiichi: { enabled: true, sticks: 2, han: 1, bonus: 1 },
        // トパーズポッチ：リーチ後はオールマイティ
        shiroPocchi: { enabled: true, count: 1, mode: 'both', almightyCondition: 'riichi_tsumo', bonus: 2 },
      },
      dora: { red: {}, indicators: 1 },
      // 5の牌に宝石牌を5種類。どれもドラ1枚ぶん＋祝儀（枚数は石ごとに違う）
      specialTiles: [
        {
          id: 'emerald5m', name: 'エメラルド5萬', tile: '5m', count: 1, color: 'green',
          activationTiming: 'win', description: 'ドラ1枚ぶん＋祝儀3枚',
          effects: [{ type: 'dora', value: 1 }, { type: 'bonus', value: 3 }], conditions: {},
        },
        {
          id: 'amethyst5p', name: 'アメジスト5筒', tile: '5p', count: 1, color: 'violet',
          activationTiming: 'win', description: 'ドラ1枚ぶん＋祝儀2枚',
          effects: [{ type: 'dora', value: 1 }, { type: 'bonus', value: 2 }], conditions: {},
        },
        {
          id: 'gold5p', name: 'ゴールド5筒', tile: '5p', count: 1, color: 'gold',
          activationTiming: 'win', description: 'ドラ1枚ぶん＋祝儀4枚',
          effects: [{ type: 'dora', value: 1 }, { type: 'bonus', value: 4 }], conditions: {},
        },
        {
          id: 'tourmaline5s', name: 'トルマリン5索', tile: '5s', count: 1, color: 'blue',
          activationTiming: 'win', description: 'ドラ1枚ぶん＋祝儀2枚',
          effects: [{ type: 'dora', value: 1 }, { type: 'bonus', value: 2 }], conditions: {},
        },
        {
          id: 'crystal5s', name: 'クリスタル5索', tile: '5s', count: 1, color: 'silver',
          activationTiming: 'win', description: 'ドラ1枚ぶん＋祝儀2枚',
          effects: [{ type: 'dora', value: 1 }, { type: 'bonus', value: 2 }], conditions: {},
        },
      ],
      // 3種類以上で「ジュエル」、全種類で「宝石箱」
      localYaku: [
        { id: 'jewel', enabled: true, han: 1 },
        { id: 'jewelbox', enabled: true, yakuman: 1 },
      ],
      bonus: {
        enabled: true, label: 'BP（ゲーム内ポイント・非換金）',
        ippatsu: 1, ura: 1, aka: 0, gold: 0, pocchi: 2, kita: 0,
        sanbaiman: 0, countedYakuman: 5, yakuman: 10, yakumanRonMultiplier: 2, tsumoAll: false,
      },
    },
  },
  {
    id: 'localyaku4',
    name: 'ローカル役採用ルール',
    category: '特殊',
    tags: ['四麻', 'ローカル役', '大車輪', '三連刻'],
    description: '大車輪・三連刻・一色三順・五門斉・人和などのローカル役を採用した四麻。役が増えるぶん手作りの狙い方が変わります。',
    rules: {
      meta: { id: 'localyaku4', name: 'ローカル役採用ルール' },
      localYaku: [
        { id: 'daisharin', enabled: true, yakuman: 1 },
        { id: 'daichisei', enabled: true, yakuman: 1 },
        { id: 'sanrenkou', enabled: true, han: 2 },
        { id: 'surenkou', enabled: true, yakuman: 1 },
        { id: 'isshoku_sanjun', enabled: true, han: 2 },
        { id: 'sanfuuko', enabled: true, han: 2 },
        { id: 'gomonsei', enabled: true, han: 2 },
        { id: 'benikujaku', enabled: true, yakuman: 1 },
        { id: 'hyakumangoku', enabled: true, yakuman: 1 },
        { id: 'renho', enabled: true, han: 5 },
        { id: 'shiisanputo', enabled: true, yakuman: 1 },
        { id: 'paarenchan', enabled: true, yakuman: 1 },
      ],
    },
  },

  // ---------------- 五等サンマ系 ----------------
  {
    id: 'goto_standard',
    name: '標準五等サンマ風',
    category: '五等サンマ',
    tags: ['三麻', '華牌', '白ポッチ', 'サイコロチャンス'],
    description: '萬子2〜8抜き・常時ドラ2枚・北抜き・春夏秋冬の華牌効果・白ポッチ・サイコロチャンスを備えた五等サンマ系の標準形。',
    rules: deep(GOTO_BASE, { meta: { id: 'goto_standard', name: '標準五等サンマ風' } }),
  },
  {
    id: 'goto_yuru',
    name: 'ゆる五等サンマ風',
    category: '五等サンマ',
    tags: ['三麻', 'ツモ損なし', '華牌'],
    description: 'ツモ損なし・30符固定・東南戦のゆるめ設定。祝儀は控えめで初心者でも大崩れしにくい。',
    rules: deep(GOTO_BASE, {
      meta: { id: 'goto_yuru', name: 'ゆる五等サンマ風' },
      game: { length: 'east_south' },
      sanma: { tsumoLoss: false },
      local: { shiroPocchi: { enabled: false }, dice: { enabled: false } },
      bonus: { ippatsu: 1, ura: 1, aka: 1, gold: 1, kita: 1, sanbaiman: 3, countedYakuman: 5, yakuman: 10 },
    }),
  },
  {
    id: 'goto_infla',
    name: 'インフレ五等サンマ風',
    category: '五等サンマ',
    tags: ['三麻', 'インフレ', '切り上げ満貫'],
    description: '赤金多め・切り上げ満貫・祝儀多めのインフレ設定。1局の振れ幅が非常に大きい。',
    rules: deep(GOTO_BASE, {
      meta: { id: 'goto_infla', name: 'インフレ五等サンマ風' },
      dora: { indicators: 2, red: { '5p': 2, '5s': 2, '1p': 1 }, gold: { '5p': 2, '5s': 2 } },
      scoring: { roundUpMangan: true, countedYakumanHan: 11 },
      bonus: { ippatsu: 2, ura: 2, aka: 1, gold: 2, pocchi: 2, kita: 1, sanbaiman: 5, countedYakuman: 8, yakuman: 15 },
    }),
  },
  {
    id: 'goto_rocket',
    name: 'ロケット五等風',
    category: '五等サンマ',
    tags: ['三麻', '東風', 'トビ賞大'],
    description: '東風戦・トビ賞大・箱下なしの短期決戦型。1半荘あたりの所要時間が短い。',
    rules: deep(GOTO_BASE, {
      meta: { id: 'goto_rocket', name: 'ロケット五等風' },
      game: { length: 'east', hakoshita: false, tobiEnd: true },
      local: { tobiBonus: { enabled: true, value: 5 } },
      scoring: { uma: [0, 0, -30], shizumiUmaValue: -15 },
    }),
  },
  {
    id: 'goto_flower',
    name: '花牌重視五等風',
    category: '五等サンマ',
    tags: ['三麻', '華牌', '打点ランクアップ'],
    description: '華牌の効果を強化。夏で2ランクアップ、春は1枚あたり2BP、冬アリスは3倍。',
    rules: deep(GOTO_BASE, {
      meta: { id: 'goto_flower', name: '花牌重視五等風' },
      flowers: {
        enabled: true, isDora: true,
        effects: {
          spring: [{ type: 'bonusPerTile', value: 2, all: true }],
          summer: [{ type: 'rankUp', value: 2 }],
          autumn: [{ type: 'doubleDoraFives' }, { type: 'dora', value: 1 }],
          winter: [{ type: 'alice', value: 3 }],
        },
      },
    }),
  },
  {
    id: 'goto_pocchi',
    name: '白ポッチ重視五等風',
    category: '五等サンマ',
    tags: ['三麻', '白ポッチ', 'オールマイティ'],
    description: '白ポッチ2枚・常時オールマイティ・使用時BP大。逆転手段としての白ポッチを主役にした設定。',
    rules: deep(GOTO_BASE, {
      meta: { id: 'goto_pocchi', name: '白ポッチ重視五等風' },
      local: {
        shiroPocchi: { enabled: true, count: 2, mode: 'both', almightyCondition: 'any_tsumo', bonus: 3, isDora: true },
      },
      bonus: { pocchi: 3 },
    }),
  },
  {
    id: 'goto_dice',
    name: 'サイコロチャンス重視五等風',
    category: '五等サンマ',
    tags: ['三麻', 'サイコロチャンス', '出目金'],
    description: 'サイコロ3個・ゾロ目連鎖・ピンゾロ20倍。トリガーも広く、出目次第で一撃が生まれる。',
    rules: deep(GOTO_BASE, {
      meta: { id: 'goto_dice', name: 'サイコロチャンス重視五等風' },
      local: {
        dice: {
          enabled: true, count: 3,
          triggers: ['yakuman', 'countedYakuman', 'fourKita', 'fourFlower', 'pocchiTsumo'],
          rerollOnDoubles: true, doublesMultiplier: 3, pinzoroMultiplier: 20,
          bonusPerPip: 1, target: 'winner', cap: 150,
        },
      },
    }),
  },
];

/** デモ店舗プリセット（架空店舗。実店舗のルールをそのまま転用しない） */
export const STORE_PRESETS = [
  {
    id: 'store_yonma_kan',
    name: 'DEMO雀荘 四麻館 ルール',
    category: '店舗',
    tags: ['四麻', '赤あり', '白ポッチ', 'アリス', '青5索'],
    description: '一般四麻ベース。ウマは10-20（ワンツー）。赤3枚＋白ポッチ1枚、アリスあり、青5索の特殊牌あり。初心者歓迎の看板ルール。',
    rules: {
      meta: { id: 'store_yonma_kan', name: 'DEMO雀荘 四麻館 ルール' },
      game: { players: 4, length: 'east_south' },
      // ウマは10-20（ワンツー）。5-10の店より順位の重みが大きい
      scoring: { startingPoints: 25000, returnPoints: 30000, uma: [20, 10, -10, -20], roundUpMangan: true },
      dora: { red: { '5m': 1, '5p': 1, '5s': 1 } },
      local: {
        shiroPocchi: { enabled: true, count: 1, mode: 'both', almightyCondition: 'riichi_tsumo', bonus: 2 },
        alice: {
          enabled: true, requireMenzen: true, requireRiichi: false, start: 'nextDora',
          matchTarget: 'hand', matchMode: 'exact', continueOnMatch: true, maxFlips: 4,
          bonusPerMatch: 1, kotsuMode: 'each', max: 10,
        },
        openRiichi: { enabled: true, han: 1, bonus: 1 },
      },
      specialTiles: [
        {
          id: 'blue5s', name: '青5索', tile: '5s', count: 1, color: 'blue',
          effects: [{ type: 'bonus', value: 2 }, { type: 'dora', value: 1 }], conditions: {},
        },
      ],
      events: [
        {
          id: 'beginner_table', name: '初心者卓', enabled: true,
          note: '赤牌を増やし、祝儀なしで気楽に打てる卓',
          ruleOverrides: {
            dora: { red: { '5m': 2, '5p': 2, '5s': 2 } },
            bonus: { enabled: false },
            local: { alice: { enabled: false } },
          },
        },
        {
          id: 'alice_fes', name: 'アリス祭', enabled: true,
          note: 'アリスが副露でも成立し、一致1枚あたり3BP',
          ruleOverrides: {
            local: { alice: { requireMenzen: false, bonusPerMatch: 3, max: 20 } },
          },
        },
      ],
    },
  },
  {
    id: 'store_tokushu_kan',
    name: 'DEMO雀荘 特殊牌館 ルール',
    category: '店舗',
    tags: ['四麻', '特殊牌', '割れ目', 'オープンリーチ'],
    description: '特殊牌ルール中心。宝石名の特殊牌を複数採用し、割れ目・オープンリーチも常時オン。',
    rules: {
      meta: { id: 'store_tokushu_kan', name: 'DEMO雀荘 特殊牌館 ルール' },
      game: { players: 4, length: 'east' },
      scoring: { roundUpMangan: true, countedYakumanHan: 11 },
      // 5筒は「銀・ルビー・アメジスト」で3枚使うため、赤5筒は指定しない
      dora: { red: { '5m': 1, '5s': 1 }, gold: {} },
      local: {
        wareme: { enabled: true, multiplier: 2 },
        openRiichi: { enabled: true, han: 2, bonus: 2 },
        shiroPocchi: { enabled: true, count: 1, mode: 'both', bonus: 2 },
        dice: {
          enabled: true, count: 2, triggers: ['yakuman', 'countedYakuman', 'pocchiTsumo'],
          rerollOnDoubles: true, doublesMultiplier: 2, pinzoroMultiplier: 10, bonusPerPip: 1, target: 'winner', cap: 60,
        },
      },
      specialTiles: [
        { id: 'blue5s', name: '青5索（アクアマリン）', tile: '5s', count: 1, color: 'blue', effects: [{ type: 'bonus', value: 2 }], conditions: {} },
        { id: 'silver5p', name: '銀5筒（シルバー）', tile: '5p', count: 1, color: 'silver', effects: [{ type: 'dora', value: 2 }], conditions: {} },
        { id: 'ruby5p', name: '赤5筒（ルビー）', tile: '5p', count: 1, color: 'red', effects: [{ type: 'bonus', value: 1 }, { type: 'dora', value: 1 }], conditions: {} },
        { id: 'emerald5m', name: '翠5萬（エメラルド）', tile: '5m', count: 1, color: 'green', effects: [{ type: 'han', value: 1 }, { type: 'bonus', value: 3 }], conditions: { menzenOnly: true } },
        { id: 'topaz_haku', name: '琥珀白（トパーズ）', tile: '5z', count: 1, color: 'gold', effects: [{ type: 'almighty' }, { type: 'bonus', value: 3 }], conditions: { tsumoOnly: true } },
        {
          id: 'amethyst5p', name: 'アメジスト5筒', tile: '5p', count: 1, color: 'blue',
          activationTiming: 'win', stacking: 'sum',
          description: 'リーチ後はオールマイティ牌として使え、和了に含めるとBPを5獲得します。',
          effects: [{ type: 'bonus', value: 5 }, { type: 'almighty' }],
          conditions: { riichiOnly: true },
        },
      ],
      events: [
        {
          id: 'almighty_day', name: 'オールマイティ解放デー', enabled: true,
          note: '白ポッチがツモならいつでもオールマイティになる日',
          ruleOverrides: {
            local: { shiroPocchi: { almightyCondition: 'any_tsumo', bonus: 4 } },
          },
        },
        {
          id: 'wareme_day', name: '割れ目デー', enabled: true,
          note: '全員割れ目。全ての支払いが2倍',
          ruleOverrides: {
            local: { wareme: { enabled: true, allPlayers: true, multiplier: 2 } },
          },
        },
      ],
      customRules: [
        {
          id: 'all_star', name: 'オールスター（特殊牌3種以上）', when: 'win',
          if: [{ fact: 'hasSpecial', id: 'blue5s' }, { fact: 'hasSpecial', id: 'silver5p' }, { fact: 'hasSpecial', id: 'emerald5m' }],
          then: [{ action: 'bonus', value: 10 }, { action: 'rankUp', value: 1 }, { action: 'dice' }],
        },
      ],
    },
  },
  {
    id: 'store_goto_kan',
    name: 'DEMO雀荘 五等サンマ館 ルール',
    category: '店舗',
    tags: ['三麻', '五等サンマ', '華牌', '白ポッチ', '金5', 'サイコロチャンス', '冬アリス', '青5索'],
    description: '35000持ち40000返し・常時ドラ2枚・北抜き・春夏秋冬・白ポッチ・金5・サイコロチャンス・冬アリス・青5索。全ボーナスはゲーム内非換金ポイント。',
    rules: deep(GOTO_BASE, {
      meta: { id: 'store_goto_kan', name: 'DEMO雀荘 五等サンマ館 ルール' },
      // 5索は「金1・赤2・青1」で4枚。5筒は「金2・赤2」で4枚。
      dora: { gold: { '5p': 2, '5s': 1 }, red: { '5p': 2, '5s': 2 } },
      specialTiles: [
        { id: 'blue5s', name: '青5索', tile: '5s', count: 1, color: 'blue', effects: [{ type: 'bonus', value: 2 }], conditions: {} },
      ],
      events: [
        {
          id: 'four_flower_challenge', name: '四華チャレンジ', enabled: true,
          note: '華牌の効果が強化される日（春3BP・夏2ランクアップ・冬アリス4倍）',
          ruleOverrides: {
            flowers: {
              effects: {
                spring: [{ type: 'bonusPerTile', value: 3, all: true }],
                summer: [{ type: 'rankUp', value: 2 }],
                autumn: [{ type: 'doubleDoraFives' }],
                winter: [{ type: 'alice', value: 4 }],
              },
            },
          },
        },
      ],
      customRules: [
        {
          id: 'four_flower_four_kita', name: '四華四北', when: 'win',
          if: [{ fact: 'flower', op: '>=', value: 3 }, { fact: 'kita', op: '>=', value: 3 }],
          then: [{ action: 'bonus', value: 20 }, { action: 'dice' }],
        },
      ],
    }),
  },
];

export const ALL_PRESETS = [...PRESETS, ...STORE_PRESETS];

export function getPreset(id) {
  return ALL_PRESETS.find((p) => p.id === id) || PRESETS[0];
}

/**
 * 見つからなければ null を返す版。
 * getPreset は見つからないと一般四麻を返すので、消した自作ルールへの
 * 古いリンクを開いても、別のルールで黙って始まってしまう。
 * このアプリは「その店のルールで打つ」ためのものなので、それはいちばん困る。
 */
export function findPreset(id) {
  return ALL_PRESETS.find((p) => p.id === id) || null;
}
