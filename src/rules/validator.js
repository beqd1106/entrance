/**
 * validator.js - ルール同士の矛盾チェック（Rule Validator）
 *
 * 方針：自由度を殺さない。
 *   error … 物理的に成立しない（存在しない牌を指定など）。修正案を提示する。
 *   warn  … 矛盾しているが「意図的な上級者設定」ならそのまま通せる。
 *   info  … 設定の組み合わせとして意味を持たないだけ。
 */
import { codeToType, typeName, NUM_TYPES } from '../core/tiles.js';
import { LOCAL_YAKU_DEFS } from '../core/yaku.js';

const LOCAL_YAKU_IDS = Object.keys(LOCAL_YAKU_DEFS);

const T_NORTH = 30;

export function validateRules(r) {
  const issues = [];
  const add = (severity, message, fix = null) => issues.push({ severity, message, fix });
  const isSanma = r.game.players === 3;

  // --- 使用牌の存在チェック
  const exists = (code) => {
    let t;
    try { t = codeToType(code); } catch { return false; }
    if (t >= NUM_TYPES) return r.flowers.enabled;
    if (isSanma && r.sanma.removeManzu && t < 9) {
      const keep = (r.sanma.manzuKeep || ['1m', '9m']).map((x) => { try { return codeToType(x); } catch { return -1; } });
      return keep.includes(t);
    }
    return true;
  };
  const usage = {};
  const bump = (code, n, label) => {
    if (!exists(code)) {
      add('error', `${label}で「${code}」を指定していますが、この設定では ${code} は使用牌に含まれません。`,
        isSanma ? '萬子2〜8を抜く設定を外すか、対象牌を変更してください。' : '牌の指定を見直してください。');
      return;
    }
    usage[code] = (usage[code] || 0) + n;
  };
  for (const [code, n] of Object.entries(r.dora.red || {})) if (n) bump(code, n, '赤牌');
  for (const [code, n] of Object.entries(r.dora.gold || {})) if (n) bump(code, n, '金牌');
  for (const def of r.specialTiles || []) bump(def.tile, def.count ?? 1, `特殊牌「${def.name}」`);
  if (r.local.shiroPocchi.enabled) usage['5z'] = (usage['5z'] || 0) + r.local.shiroPocchi.count;
  for (const [code, n] of Object.entries(usage)) {
    if (n > 4) add('error', `「${code}」に付与した特別な属性が合計${n}枚で、実際の4枚を超えています。`, '枚数を4枚以内に収めてください。');
  }

  // --- 三麻 / 四麻の整合
  if (isSanma && r.win.chi) add('warn', '三人麻雀でチーが有効になっています（自動的に無効化されます）。', 'チーをオフにしてください。');
  if (!isSanma && r.sanma.northMode === 'nuki') add('info', '四人麻雀では北抜きの設定は使用されません。');
  if (isSanma && r.sanma.northMode === 'nuki' && r.sanma.northIsYakuhai) {
    add('warn', '北を「抜きドラ」と「役牌」の両方に設定しています。抜いた北と手牌の北で扱いが分かれるため、初来店の方に説明が必要です。', 'どちらか一方に寄せると分かりやすくなります。');
  }
  for (const msg of r.meta.autoFixed || []) {
    add('warn', `設定を自動調整しました：${msg}`, '意図的でなければ設定画面で見直してください。');
  }
  if (r.scoring.uma.length !== r.game.players) {
    add('warn', `ウマの項目数（${r.scoring.uma.length}）が人数（${r.game.players}）と一致していません。`, '人数分のウマを設定してください。');
  }

  // --- 五等サンマ系の整合
  const gotoish = isSanma && r.scoring.startingPoints === 35000 && r.dora.indicators >= 2;
  if (gotoish && !r.flowers.enabled) {
    add('warn', '五等サンマ系の設定（35,000点持ち・常時ドラ2枚）ですが華牌が無効です。春夏秋冬の効果が発動しません。', '華牌を有効にしてください。');
  }
  if (r.flowers.enabled && r.game.players === 4) {
    add('info', '四人麻雀で華牌を使う設定です。抜きドラ扱いの説明を店舗ページに明記することを推奨します。');
  }
  const usesAliceEffect = Object.values(r.flowers.effects || {}).some((list) => (list || []).some((e) => e.type === 'alice'));
  if (usesAliceEffect && !r.flowers.enabled) add('info', '華牌のアリス効果が設定されていますが、華牌自体が無効です。');

  // --- 点数・順位
  if (r.scoring.startingPoints > r.scoring.returnPoints) {
    add('warn', `持ち点（${r.scoring.startingPoints}）が返し点（${r.scoring.returnPoints}）より多く、オカがマイナスになります。`, '通常は持ち点 ≦ 返し点です。');
  }
  if (r.scoring.rankOnly && r.scoring.okaToTop) add('info', '完全順位制ではオカの設定は結果に影響しません。');
  if (r.scoring.countedYakumanHan < 8) {
    add('warn', `数え役満の開始翻数が${r.scoring.countedYakumanHan}翻と低く、役満が頻発します。`, '11〜13翻が一般的です。');
  }
  if (r.win.minHan === 0) add('warn', '役なし（ドラのみ）での和了が可能な設定です。', '通常は1翻縛りです。');
  if (!r.game.tobiEnd && !r.game.hakoshita) add('info', 'トビ終了なし・箱下計算なしの組み合わせです。0点未満の扱いを店舗ページに明記してください。');
  if (r.game.length === 'ikkyoku' && r.game.agariYame) add('info', '一局清算ではアガリやめの設定は使用されません。');

  // --- ドラ・特殊牌
  if (r.dora.indicators > 5) add('error', `表ドラ表示牌が${r.dora.indicators}枚で、王牌に収まりません。`, '5枚以内にしてください。');
  if (r.dora.indicators + (r.dora.kanDora ? 4 : 0) > 5) {
    add('info', '常時ドラ＋槓ドラの合計が王牌の表示可能枚数を超える場合、超過分は表示されません。');
  }
  if (!r.dora.ura && r.bonus.enabled && r.bonus.ura > 0) add('info', '裏ドラ無しなのに裏ドラのボーナスが設定されています。');
  const spIds = new Set((r.specialTiles || []).map((d) => d.id));
  for (const def of r.specialTiles || []) {
    for (const id of def.conditions?.combo || []) {
      if (!spIds.has(id)) add('error', `特殊牌「${def.name}」の組み合わせ条件に未定義の特殊牌ID「${id}」が指定されています。`);
    }
    const alm = (def.effects || []).some((e) => e.type === 'almighty');
    if (alm && !def.conditions?.tsumoOnly && !def.conditions?.riichiOnly) {
      add('warn', `特殊牌「${def.name}」が無条件のオールマイティです。バランスが大きく崩れます。`, 'リーチ時・ツモ時などの条件を付けることを推奨します。');
    }
  }
  for (const rule of r.customRules || []) {
    for (const f of rule.if || []) {
      if (f.fact === 'hasSpecial' && !spIds.has(f.id)) {
        add('error', `ハウスルール「${rule.name}」が未定義の特殊牌ID「${f.id}」を参照しています。`);
      }
      if (f.fact === 'hasTile' && !exists(f.tile)) {
        add('error', `ハウスルール「${rule.name}」が使用牌に存在しない「${f.tile}」を参照しています。`);
      }
    }
  }

  // --- ローカルルール
  if (r.local.wareme.enabled && r.local.wareme.multiplier > 4) {
    add('warn', `割れ目の倍率が${r.local.wareme.multiplier}倍です。1局で決着する可能性が高くなります。`);
  }
  if (r.local.alice.enabled && r.local.tulip.enabled) {
    add('info', 'アリスとチューリップを同時に採用しています。両方めくるため祝儀が二重になります（意図的なら問題ありません）。');
  }
  if (r.local.dice.enabled && !(r.local.dice.triggers || []).length) {
    add('warn', 'サイコロチャンスが有効ですが、発動条件（トリガー）が空です。', '役満・数え役満などのトリガーを1つ以上選んでください。');
  }
  if (r.local.openRiichi.enabled && r.local.openRiichi.dealInPenalty === 'yakuman') {
    add('warn', 'オープンリーチへの放銃を役満払いにする設定です。初心者にはリスクが大きい旨の明記を推奨します。');
  }
  if (r.local.shiroPocchi.enabled && r.local.shiroPocchi.mode !== 'bonus'
    && r.local.shiroPocchi.almightyCondition === 'always') {
    add('warn', '白ポッチが常時オールマイティです。和了率が大きく変わります。', 'リーチツモ時限定が一般的です。');
  }

  // --- 追加ルールの整合
  if (r.scoring.mode === 'flat') {
    if (r.scoring.startingPoints !== 0) {
      add('info', '東天紅系の点数体系では持ち点は使いません（0点開始として扱われます）。');
    }
    if (r.game.tobiEnd) add('warn', '東天紅系はマイナス点が普通に発生するため、トビ終了ありは意図しない終局を招きます。', 'トビ終了をオフにしてください。');
    if (r.scoring.flat.scale <= 0) add('error', '点数の倍率（scale）が0以下です。');
  }
  if (r.dora.bakuDora > 0 && r.dora.indicators + r.dora.bakuDora > 5) {
    add('warn', `表ドラ表示牌の合計が${r.dora.indicators + r.dora.bakuDora}枚で、王牌の表示可能枚数（5枚）を超えます。`, '爆ドラの枚数を減らしてください。');
  }
  for (const y of r.localYaku || []) {
    if (!LOCAL_YAKU_IDS.includes(y.id)) {
      add('error', `未定義のローカル役ID「${y.id}」が指定されています。`, '対応済みのIDから選んでください。');
    }
    if (y.han && y.yakuman) add('info', `ローカル役「${y.name || y.id}」に翻数と役満の両方が指定されています（役満が優先されます）。`);
  }
  if ((r.sanma.extraNukiTiles || []).length && r.game.players !== 3) {
    add('info', '四人麻雀では抜き牌（ガリ）の設定は使用されません。');
  }
  for (const code of r.sanma.extraNukiTiles || []) {
    if (!exists(code)) add('error', `抜き牌に指定された「${code}」がこの設定の使用牌に含まれていません。`);
  }
  if (r.game.dealerRule === 'winner' && r.renchan.dealerRepeat !== 'none') {
    add('info', '「前局の和了者が親」の設定では、連荘の設定は実質的に使われません。');
  }
  if (r.local.wareme.allPlayers && r.local.wareme.multiplier > 2) {
    add('warn', `全員割れ目で倍率${r.local.wareme.multiplier}倍です。1局の振れ幅が極端になります。`);
  }
  for (const def of r.specialTiles || []) {
    if (def.activationTiming && !['win', 'draw', 'nuki', 'discard', 'always'].includes(def.activationTiming)) {
      add('error', `特殊牌「${def.name}」の発動タイミング「${def.activationTiming}」は未対応です。`);
    }
    if ((def.effects || []).some((e) => e.type === 'scoreMultiply') && (def.count ?? 1) > 1) {
      add('warn', `特殊牌「${def.name}」は点数を倍化する効果を持つため、枚数を増やすと打点が指数的に伸びます。`);
    }
  }

  // --- 換金性（法務セーフティ）
  if (r.bonus.enabled && !/非換金/.test(r.bonus.label || '')) {
    add('warn', 'ゲーム内ポイントの表記に「非換金」の明示がありません。', '景品・金銭と結び付かない表記にしてください（要専門家確認）。');
  }

  const summary = {
    errors: issues.filter((i) => i.severity === 'error').length,
    warns: issues.filter((i) => i.severity === 'warn').length,
    infos: issues.filter((i) => i.severity === 'info').length,
  };
  return { issues, summary, ok: summary.errors === 0 };
}
