/**
 * defaults.js - ルール設定のスキーマと既定値
 *
 * 設計思想：
 *   ゲームエンジンは「店名」を一切知らない。エンジンが読むのはこの形のデータだけ。
 *   店舗プリセット = この形の部分オブジェクト（差分）であり、resolveRules() で既定値と合成される。
 */

export const DEFAULT_RULES = {
  meta: {
    id: 'standard4',
    name: '一般四麻',
    description: 'フリー雀荘で最も一般的な四人半荘・喰いタンあり赤あり。',
    basedOn: null,
  },

  // 6-1. 基本ゲーム設定 ---------------------------------------------------
  game: {
    players: 4,                 // 4 | 3
    length: 'east_south',       // 'east'(東風) | 'east_south'(半荘) | 'ikkyoku'(一局清算)
    agariYame: true,            // オーラス親のアガリやめ
    tenpaiYame: false,          // オーラス親のテンパイやめ
    tobiEnd: true,              // トビ終了
    tobiZeroIsEnd: true,        // 0点ちょうどをトビとするか
    hakoshita: true,            // 箱下（マイナス）計算を続行するか
    westEntry: false,           // 西入
    westEntrySuddenDeath: true, // 西入後サドンデス（誰かが返し点超えで終了）
    returnEast: false,          // 返り東
    sameScoreRank: 'seat',      // 同点順位処理 'seat'(起家優先) | 'dice'
    dealerDecide: 'dice',       // 親決め
    alwaysEast: false,          // 常に東場（場風が変わらない：東天紅系）
    dealerRule: 'rotate',       // 'rotate'（通常）| 'winner'（前局の和了者が次局の親）
    // 誰かがこの点数に達したら、その局で終わる（いわゆる「四万点クビ」）
    pointCapEnd: { enabled: false, points: 40000 },
    timeLimitMinutes: 0,        // 時間打ち切り（0で無効。UIは将来対応）
    maxKyoku: 12,               // 安全弁（無限ループ防止）
  },

  // 6-4. 点数計算 ---------------------------------------------------------
  scoring: {
    startingPoints: 25000,
    returnPoints: 30000,
    useFu: true,                // 符計算あり
    roundUpMangan: false,       // 切り上げ満貫
    countedYakuman: true,       // 数え役満
    countedYakumanHan: 13,      // 数え役満開始翻数
    doubleYakuman: true,        // ダブル役満（国士十三面・四暗単騎・大四喜・純正九蓮）
    multipleYakuman: true,      // 役満複合
    doubleWindPairFu: false,    // 連風牌の雀頭を4符にする
    honbaPoints: 300,           // 本場点（1本場あたり総額）
    riichiStick: 1000,
    /**
     * 順位点。四麻のフリー雀荘でいちばん多いのは「5-10」＝
     * 1位+10 / 2位+5 / 3位-5 / 4位-10。
     * 「10-20（ワンツー）」の店も多く、そこは店ごとに設定する。
     */
    uma: [10, 5, -5, -10],
    okaToTop: true,
    // 点数体系そのものを差し替える（東天紅・ロケット三麻など）
    mode: 'standard',           // 'standard' | 'flat'
    flat: {
      fuFixed: 40,              // 符固定
      scale: 0.001,             // 子ロン相当点に掛ける倍率（8000点→8点）
      yakumanPoints: 50,        // 役満の点（翻計算を通さない固定値）
      promoteMinHan: 0,         // この翻数以下は昇格させる（ロケット系の「1翻は倍満」）
      promoteTo: 'baiman',      // 'mangan'|'haneman'|'baiman'|'sanbaiman'
      honbaPoints: 5,           // 1本場あたり
      tsumoIsDouble: true,      // ツモはロンの2倍（＝各支払者が1人分ずつ払う）
      // 抜き牌1枚あたりの点。東天紅のガリは1枚4点として和了者の点に加わる
      nukiPoints: 0,
    },
    rankOnly: false,            // 完全順位制（素点を使わない）
    umaZeroSum: false,          // トップのウマを他家合計の裏返しで確定
    shizumiUma: false,          // 沈みウマ
    shizumiUmaValue: -10,
    pao: true,                  // パオ（責任払い）
    /**
     * クビ（四万点クビなど）。
     * 終局時に規定の持ち点に届かなかった人へ、スコアからペナルティを引く。
     * 「4万点持っていない人は −10」のような雀荘ルールを表す。
     */
    kubi: {
      enabled: false,
      threshold: 40000,         // この点数に届かなければ対象
      penalty: -10,             // 加算するスコア（マイナスで書く）
      exceptTop: false,         // トップだけは免除する
    },
    /**
     * 素点の丸め方。
     * 'none'  … そのまま（競技寄り）
     * 'go'    … 五捨六入（500点以下は切り捨て、600点以上は切り上げ：フリー雀荘の定番）
     * 'ceil'  … 100点でも切り上げ
     * 'floor' … 切り捨て
     */
    rawRounding: 'none',
  },

  // 6-2. 鳴き・和了条件 ---------------------------------------------------
  win: {
    kuitan: true,               // 喰いタン
    atozuke: true,              // 後付け許容（false = 完全先付け）
    kuikae: false,              // 食い替え
    chi: true,
    pon: true,
    kan: true,
    furitenRiichi: false,       // フリテンリーチ許容
    riichiMiss: 'furiten',      // リーチ後見逃し 'furiten'(以後フリテン) | 'chombo'
    riichiWithoutTsumoban: false, // ツモ番なしリーチ
    formalTenpai: true,         // 形式テンパイ認める
    junkara: true,              // 純カラでもテンパイ扱い
    ankanAfterRiichi: true,     // リーチ後の暗槓
    doubleRon: true,            // ダブロン
    tripleRon: 'draw',          // 三家和 'draw'(流局) | 'headbump'(頭ハネ) | 'all'
    headBump: false,            // 頭ハネ（ダブロン不採用時）
    minHan: 1,                  // 和了に必要な最低翻（役なし和了禁止）
    /**
     * 平和とツモを複合させるか。
     * 関西のサンマには「平和ツモなし」（ツモると平和が消える）店が多い。
     * false にすると、ツモ和了のとき平和を数えない。
     */
    pinfuTsumo: true,
  },

  // 6-3. 連荘・流局 -------------------------------------------------------
  renchan: {
    dealerRepeat: 'agari',      // 'agari'(和了連荘) | 'tenpai'(テンパイ連荘) | 'always'(親流れなし) | 'none'
    kyuushuKyuuhai: true,       // 九種九牌
    suufonRenda: true,          // 四風連打
    suukaikan: true,            // 四開槓
    suuchaRiichi: true,         // 四人立直
    honbaOnDraw: true,          // 流局で積み棒
  },

  ryuukyoku: {
    notenPenalty: 3000,
    nagashiMangan: true,
    // 流し満貫を役満として払う店がある
    nagashiYakuman: false,
  },

  // 6-5. ドラ・特殊牌 -----------------------------------------------------
  dora: {
    indicators: 1,              // 表ドラ表示牌の枚数（常時ドラ2枚なら 2）
    ura: true,
    kanDora: true,
    kanUra: true,
    red: { '5m': 1, '5p': 1, '5s': 1 },   // 赤牌の枚数
    gold: {},                              // 金牌の枚数 例 {'5p':1}
    goldIsDora: true,
    blue: {},                   // 青牌の枚数 例 {'5s':1}
    star: {},                   // 星牌の枚数
    rainbow: {},                // 虹牌の枚数
    // 属性1枚あたり何枚分のドラとして数えるか（金牌=ドラ2、虹牌=ドラ3 などを表現）
    attributeDora: { red: 1, gold: 1, blue: 1, star: 1, rainbow: 2 },
    bakuDora: 0,                // 爆ドラ：局開始時に追加でめくる表示牌の枚数
    permanentDora: [],          // 永久ドラ（牌コード配列）例 ['0m'] は赤5萬
    flowerIndicatorEffect: 'none', // ドラ表示牌が花牌だった時 'none'|'redraw'|'allFives'
    indicatorSpecialEffect: 'none', // ドラ表示牌が特殊牌だった時 'none'|'reroll'|'allFives'
  },

  // ローカルルール --------------------------------------------------------
  local: {
    shiroPocchi: {
      enabled: false,
      count: 1,
      mode: 'both',             // 'bonus' | 'almighty' | 'both'
      almightyCondition: 'riichi_tsumo', // 'riichi_tsumo' | 'any_tsumo' | 'always'
      bonus: 1,                 // 使用時のゲーム内ボーナスポイント
      isDora: false,
    },
    openRiichi: {
      enabled: false,
      han: 1,
      bonus: 1,
      revealMode: 'all',        // 'all'（全手牌公開）| 'waits'（待ち牌のみ）
      allowDouble: false,       // ダブルオープンリーチ（さらに加翻）
      doubleHan: 2,
      dealInPenalty: 'none',    // 'none' | 'yakuman'（オープンリーチへの放銃は役満払い）
    },
    wareme: {
      enabled: false,
      multiplier: 2,
      allPlayers: false,        // 全員割れ目
      notenExempt: false,       // ノーテン罰符は倍付け対象外
      honbaExempt: false,       // 本場点は倍付け対象外
      bonusToo: false,          // ゲーム内ポイントも倍付け
      decideBy: 'dice',         // 'dice' | 'dealer'（親固定）| 'random'
    },
    // 17. アリス（詳細設定）
    alice: {
      enabled: false,
      requireMenzen: true,
      requireRiichi: false,
      tsumoOnly: false,
      start: 'nextDora',        // 'nextDora'(ドラ表示牌の隣) | 'deadWallEnd'
      order: 'forward',         // めくる順番
      matchTarget: 'hand',      // 'hand'(手牌のどれかと一致) | 'winTile'(和了牌と一致)
      matchMode: 'exact',       // 'exact' | 'tulip'(現物＋両隣)
      continueOnMatch: true,
      maxFlips: 4,
      bonusPerMatch: 1,         // 一致1枚あたりのゲーム内ボーナス
      pointsPerMatch: 0,        // 一致1枚あたりの点棒（0で無効）
      kotsuMode: 'each',        // 刻子時 'each'(枚数分) | 'one'(1回のみ)
      tsumoMultiplier: 1,
      ronMultiplier: 1,
      max: 12,                  // 上限
    },
    tulip: {
      enabled: false,
      requireMenzen: true,
      requireRiichi: false,
      tsumoOnly: false,
      start: 'nextDora',
      order: 'forward',
      matchTarget: 'hand',
      matchMode: 'tulip',
      continueOnMatch: true,
      maxFlips: 4,
      bonusPerMatch: 1,
      pointsPerMatch: 0,
      kotsuMode: 'each',
      tsumoMultiplier: 1,
      ronMultiplier: 1,
      max: 12,
    },
    // 18. サイコロチャンス / 出目金（汎用 Dice Bonus Engine）
    dice: {
      enabled: false,
      count: 2,
      triggers: ['yakuman', 'countedYakuman', 'fourKita', 'fourFlower'],
      rerollOnDoubles: true,
      doublesMultiplier: 2,
      pinzoroMultiplier: 10,
      bonusPerPip: 1,           // 出目1あたりのボーナス
      target: 'winner',         // 'winner' | 'all'
      cap: 100,
    },
    yakitori: {
      enabled: false,
      penalty: 5,               // 未和了で終局した場合のボーナスポイント減
    },
    binta: {
      enabled: false,
      perRank: [2, 0, -2, -4],  // 順位ビンタ（ゲーム内ボーナス）
    },
    tobiBonus: {
      enabled: false,
      value: 2,                 // トビ賞（トバした側が受け取るボーナス）
    },
    /**
     * 少牌マイティ。
     * 手牌を1枚少なく配り、足りない分を「何にでもなる牌」として常に持っている扱いにする。
     * テンパイ形＝和了になるので、進行がとても速くなる。
     */
    shouhaiMighty: {
      enabled: false,
      count: 1,                 // 少なく配る枚数＝マイティ牌の数
    },
    kokushiAnkanRon: false,     // 国士の暗槓ロン
    /**
     * 七対子の8枚使い。
     * 2セットの牌を混ぜる清一色ゲームのように同じ牌が5枚以上あるルールでは、
     * 同じ牌4枚を2つの対子として七対子に数えることを認める店がある。
     */
    chiitoiMultiPair: false,
  },

  // 牌山の構成 -----------------------------------------------------------
  // 全自動卓の2セットを混ぜる「清一色ゲーム」のように、
  // 牌種ごとの枚数そのものが変わるルールがあるため、枚数を外から指定できるようにする。
  wall: {
    // { '5m': 8 } のように牌コード→枚数。指定がない牌種は既定の4枚。
    // 「{ p: 8 }」のように色でまとめても書ける（清一色ゲームの1種8枚など）。
    tileCounts: {},
    /**
     * 局ごとに使う数牌の色を入れ替える。
     * 清一色ゲームは、筒子だけの回と索子だけの回を交互に打つ。
     * ['p','s'] と書くと東1局＝筒子、東2局＝索子…と入れ替わる。空なら入れ替えない。
     */
    suitRotation: [],
    /**
     * 王牌の枚数。
     * 一般的な14枚のほか、「ドラ表示牌の隣まで引ききる」ように少なくしたり、
     * 17枚残す店もある。ここを変えると1局で打てる巡目が変わる。
     */
    deadWallSize: 14,
    // 2セットの牌を混ぜるルールでは、牌の裏の色が2色になる（背一色の判定に使う）
    backColors: { enabled: false, colors: ['blue', 'yellow'] },
  },

  // 三麻設定 -------------------------------------------------------------
  sanma: {
    removeManzu: true,          // 萬子を抜く（残す牌は manzuKeep で指定）
    manzuKeep: ['1m', '9m'],    // 残す萬子（東天紅は ['1m','5m','9m']）
    northMode: 'nuki',          // 'nuki'(北抜き) | 'yakuhai'(役牌) | 'normal'(通常牌)
    kitaIsDora: true,           // 抜いた北がドラ
    northIsYakuhai: false,      // 手牌の北を役牌にする
    northRonOk: false,          // 他家が抜いた北でロン可
    kitaBonus: 1,               // 北1枚あたりのゲーム内ボーナス
    tsumoLoss: true,            // ツモ損あり（false = 丸取り／ツモ損なし）
    dealerRepeatOnRyuukyoku: false,
    // 抜き（北・ガリ）の細かい扱い
    extraNukiTiles: [],         // 北以外の抜き牌（東天紅のガリ：['1m','5m','9m']）
    kitaBreaksIppatsu: false,   // 抜きで一発が消える
    kitaIsRinshan: false,       // 抜き後のツモが嶺上開花になる
    kitaUsableInHand: 'yakumanOnly', // 手牌での使用 'always'|'yakumanOnly'|'never'
  },

  // 花牌（華牌）エフェクトエンジン ---------------------------------------
  flowers: {
    enabled: false,
    // 引いた瞬間に自動で抜くか、自分でタップして抜くか。
    // 抜く間合いも打ち手の判断のうち、と考える店があるため選べるようにする
    manualDraw: false,
    tiles: ['spring', 'summer', 'autumn', 'winter'],
    isDora: false,              // 抜いた花牌をドラとして数える
    bonusPerTile: 0,
    effects: {
      // type: bonusPerTile | rankUp | doubleDoraFives | alice | dora | han | dice
      spring: [{ type: 'bonusPerTile', value: 1, all: true }],
      summer: [{ type: 'rankUp', value: 1 }],
      autumn: [{ type: 'doubleDoraFives' }],
      winter: [{ type: 'alice', value: 2 }],
    },
  },

  // 16. 特殊牌エンジン ---------------------------------------------------
  /**
   * specialTiles: [{
   *   id, name, tile:'5s', count:1, color:'blue'|'gold'|'red'|'silver'|...,
   *   effects: [{type:'dora'|'han'|'bonus'|'almighty'|'doubleDora'|'rankUp'|'yakuman'|'bonusMultiply', value}],
   *   conditions: {menzenOnly, riichiOnly, tsumoOnly, ronOnly, ippatsuOnly, openInvalid, combo:[id]}
   * }]
   */
  specialTiles: [],

  /**
   * ローカル役（店舗ごとに採用/不採用が分かれる役）
   * condition は組み込み述語のID。han または yakuman を指定する。
   * 例: { id:'daisharin', enabled:true, yakuman:1 }
   */
  localYaku: [],

  /**
   * 標準役の翻数の上書き。
   * 「清一色は役満」「七対子は3翻」のような店ごとの取り決めを表す。
   *   { '清一色': { han: 8 } }      … 翻数を変える
   *   { '清一色': { yakuman: 1 } }  … 役満として扱う
   *   { '一発': { enabled: false } }… その役を採用しない
   * 門前と鳴きで翻が違う役（清一色など）は、指定した値で固定される。
   */
  yakuOverrides: {},

  /**
   * イベント卓（日替わり・イベント限定でルールを上書きする）
   * { id, name, enabled, note, ruleOverrides:{ 部分的なRuleConfig } }
   */
  events: [],

  // 16. House Rule Builder（WHEN / IF / THEN） ---------------------------
  /**
   * customRules: [{
   *   id, name, when:'win'|'draw'|'kyokuStart'|'kan'|'kita'|'flower',
   *   if: [{fact:'hasTile'|'hasSpecial'|'menzen'|'tsumo'|'ron'|'riichi'|'ippatsu'|'han'|'yakuman'|'dealer', ...}],
   *   then: [{action:'bonus'|'han'|'rankUp'|'dice'|'points'|'message', value, text}]
   * }]
   */
  customRules: [],

  /**
   * 料金の案内。
   * 対局そのものには影響しない表示用の値で、店舗ページと対局前の確認に出る。
   * ゲーム内ポイント（BP）とは無関係で、BPをお金に換える設計は持たない。
   */
  fees: {
    show: false,
    perGame: 0,                 // 1半荘あたり（円）
    seat: 0,                    // 席料・時間料（円／時間）
    note: '',                   // 「学生割あり」などの補足
  },

  // ゲーム内ボーナスポイント（すべて非換金・デモ用） --------------------
  bonus: {
    enabled: true,
    label: 'BP（ゲーム内ポイント・非換金）',
    ippatsu: 1,
    ura: 1,
    aka: 1,
    gold: 1,
    pocchi: 1,
    kita: 1,
    sanbaiman: 3,
    countedYakuman: 5,
    yakuman: 10,
    yakumanRonMultiplier: 2,
    tsumoAll: true,             // ツモは「オール」で人数分
    menzen: 0,                  // 門前和了ボーナス
    openRiichiBonus: 0,         // オープンリーチ成立ボーナス
    top: 0,                     // トップ賞
    lastAvoid: 0,               // ラス回避ボーナス
    baiman: 0,                  // 倍満ボーナス
  },
};

/** 深いマージ（配列は置き換え） */
export function deepMerge(base, patch) {
  if (patch === undefined || patch === null) return clone(base);
  if (Array.isArray(base) || Array.isArray(patch)) return clone(patch);
  if (typeof base !== 'object' || typeof patch !== 'object') return clone(patch);
  const out = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(patch)])) {
    out[k] = k in patch ? deepMerge(base[k], patch[k]) : clone(base[k]);
  }
  return out;
}

export function clone(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(clone);
  const o = {};
  for (const k of Object.keys(v)) o[k] = clone(v[k]);
  return o;
}

/**
 * 部分設定を既定値と合成し、整合性のある実行用ルールへ変換する。
 * 三麻／四麻の物理的な前提だけはここで強制する（矛盾する自由設定は validator が警告する）。
 */
export function resolveRules(patch = {}) {
  const r = deepMerge(DEFAULT_RULES, patch);
  // 赤牌・金牌・花牌の効果は「積み上げ」ではなく「置き換え」として扱う。
  // 重ねてしまうと、既定の効果（春＝ボーナス、冬＝アリスなど）を
  // 空の指定で消せず、意図しない効果が残ったままになる。
  if (patch.dora && patch.dora.red) r.dora.red = clone(patch.dora.red);
  if (patch.dora && patch.dora.gold) r.dora.gold = clone(patch.dora.gold);
  if (patch.flowers && patch.flowers.effects) r.flowers.effects = clone(patch.flowers.effects);
  for (const key of ['red', 'gold']) {
    for (const [code, n] of Object.entries(r.dora[key])) if (!n) delete r.dora[key][code];
  }
  // 使用牌に存在しない牌への属性指定は自動的に外し、記録して編集画面へ返す
  r.meta.autoFixed = [];
  if (r.game.players === 3 && r.sanma.removeManzu) {
    for (const key of ['red', 'gold']) {
      const keep = new Set(r.sanma.manzuKeep || ['1m', '9m']);
      for (const code of Object.keys(r.dora[key])) {
        if (code[1] === 'm' && !keep.has(code)) {
          delete r.dora[key][code];
          r.meta.autoFixed.push(`${key === 'red' ? '赤' : '金'}${code} は萬子を抜く設定のため無効化しました`);
        }
      }
    }
  }
  if (r.game.players === 3) {
    r.win.chi = false;                       // 三麻でチーは物理的に成立しない
    if (r.sanma.northMode === 'nuki') r.sanma.kitaEnabled = true;
  } else {
    r.sanma.kitaEnabled = false;
    r.sanma.removeManzu = false;
  }
  r.game.length = r.game.players === 3 && r.game.length === 'east_south'
    ? 'east_south' : r.game.length;
  // score.js が参照する持ち点・返し点は scoring に集約
  r.scoring.uma = r.scoring.uma.slice(0, r.game.players);
  return r;
}

/** 一般ルール（差分表示のベースライン） */
export function baselineRules(players = 4) {
  return resolveRules({ game: { players }, meta: { name: players === 3 ? '一般三麻' : '一般四麻' } });
}
