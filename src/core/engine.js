/**
 * engine.js - ゲーム進行エンジン
 *
 * 構造:
 *   GameEngine（局・巡目・手番の管理）
 *     ├─ Wall            牌山（ルールから使用牌を生成）
 *     ├─ 行動生成         getChoices()
 *     ├─ 行動適用         act()
 *     ├─ HandEvaluator   hand.js / yaku.js
 *     ├─ ScoreEngine     score.js
 *     └─ RuleEngine      rules/*.js + effects.js
 *
 * エンジンは「店名」を知らない。挙動の差は rules オブジェクトの差だけで生まれる。
 */
import {
  T, NUM_TYPES, typeToCode, codeToType, tileName, typeName, isYaochu, numOf, isFlower, doraNext, sortTiles,
} from './tiles.js';
import { shanten, waits, countsFromTiles, shantenWithWild, waitsWithWild, makeHandOpts } from './hand.js';
import { evaluate } from './yaku.js';
import { basePoints, settleWin, settleNoten, finalScores } from './score.js';
import { Wall, makeRng, tileLimits, FLOWER_ID, FLOWER_LABEL } from './wall.js';
import {
  applySpecialTiles, almightyTiles, runFlipBonus, rollDiceBonus,
  applyFlowerEffects, runCustomRules, collectWinBonus, mergeInto, emptyEffect,
} from './effects.js';

const WINDS = ['東', '南', '西', '北'];

export class GameEngine {
  constructor({ rules, seed = Date.now(), players = null, debug = {} }) {
    this.rules = rules;
    this.rng = makeRng(seed);
    this.seed = seed;
    this.debug = Object.assign({
      showCpuHands: false, forcedWall: null, forceAlice: false, forceDice: false,
      nextDraws: null, startPoints: null,
    }, debug);
    this.n = rules.game.players;
    this.players = [];
    for (let i = 0; i < this.n; i++) {
      const p = players && players[i] ? players[i] : {};
      this.players.push({
        seat: i,
        name: p.name || (i === 0 ? 'あなた' : `CPU${i}`),
        isCpu: p.isCpu !== undefined ? p.isCpu : i !== 0,
        level: p.level || 'normal',
        points: this.debug.startPoints ? this.debug.startPoints[i] : rules.scoring.startingPoints,
        bonus: 0,
        wins: 0,
      });
    }
    this.round = { wind: 0, kyoku: 1, honba: 0, kyotaku: 0, dealer: 0 };
    this.events = [];
    this.finished = false;
    this.result = null;
    this.kyokuCount = 0;
    this.log = [];
  }

  // =========================================================================
  // 局の開始
  // =========================================================================
  /**
   * 「何にでもなる牌」を何枚持っている前提か。
   * 少牌マイティでは配牌を1枚減らし、その1枚を常に持っているものとして扱う。
   */
  get wild() {
    const m = this.rules.local.shouhaiMighty;
    return m && m.enabled ? Math.max(1, m.count || 1) : 0;
  }

  startKyoku() {
    const R = this.rules;
    this.wall = new Wall(R, this.rng, this.debug);
    // 手牌計算の前提（同じ牌の上限枚数・七対子の8枚使い）は牌山の作り方で変わる。
    // 局ごとに1度だけ作って、向聴数・待ち・受け入れの計算すべてに渡す。
    const localOn = new Set((R.localYaku || [])
      .filter((y) => y && y.enabled !== false).map((y) => y.id));
    this.handOpts = makeHandOpts(
      tileLimits(this.wall.all), R.local.chiitoiMultiPair, localOn.has('chiiseimukou'),
    );
    this.kyokuCount++;
    this.wareme = null;
    if (R.local.wareme.enabled) {
      const dice = 2 + Math.floor(this.rng() * 6) + Math.floor(this.rng() * 6);
      const mode = R.local.wareme.decideBy || 'dice';
      if (R.local.wareme.allPlayers) this.wareme = -1;                    // 全員割れ目
      else if (mode === 'dealer') this.wareme = this.round.dealer;
      else if (mode === 'random') this.wareme = Math.floor(this.rng() * this.n);
      else this.wareme = (this.round.dealer + (dice - 1)) % this.n;
      this.pushEvent({ type: 'wareme', seat: this.wareme, dice, all: !!R.local.wareme.allPlayers });
    }
    for (const p of this.players) {
      p.hand = [];
      p.melds = [];
      p.discards = [];
      p.kita = [];
      p.flowers = [];
      p.riichi = false;
      p.riichiIdx = -1;
      p.doubleRiichi = false;
      p.openRiichi = false;
      p.ippatsu = false;
      p.furiten = false;
      p.tempFuriten = false;
      p.drawn = null;
      p.tenpai = false;
      p.riichiTileId = null;
      p.menzenAtRiichi = true;
      p.nagashi = true;
      p.effectAcc = emptyEffect();
    }
    // 配牌。少牌マイティのときは、その枚数だけ少なく配る
    for (let r = 0; r < 13 - this.wild; r++) {
      for (let i = 0; i < this.n; i++) {
        const seat = (this.round.dealer + i) % this.n;
        this.players[seat].hand.push(this.wall.draw());
      }
    }
    // 配牌時の花牌を抜く
    for (const p of this.players) this.resolveFlowersInHand(p, true);
    for (const p of this.players) p.hand = sortTiles(p.hand);

    this.turn = this.round.dealer;
    this.phase = 'turn';
    this.pending = null;
    this.kanCount = 0;
    this.firstGoAround = true;
    this.discardSeq = 0;
    this.riichiDeclaredThisKyoku = 0;
    this.kyokuEnd = null;
    this.pushEvent({ type: 'kyokuStart', wind: this.round.wind, kyoku: this.round.kyoku, honba: this.round.honba, dealer: this.round.dealer });
    this.drawTile(this.turn, false);
    // ゲージの分母。配り終えたあとの残り枚数を、その局の満タンとする
    this.wallAtStart = this.wall.remaining;
    return this;
  }

  pushEvent(e) { this.events.push(e); this.log.push(e); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  // =========================================================================
  // ツモ・花牌・北
  // =========================================================================
  drawTile(seat, isReplacement) {
    const p = this.players[seat];
    let tile = isReplacement ? this.wall.drawReplacement() : this.wall.draw();
    if (!tile) { this.endKyokuByDraw(); return null; }
    p.drawn = tile;
    p.hand.push(tile);
    this.pushEvent({ type: 'draw', seat, tile: this.tileInfo(tile), replacement: !!isReplacement });
    // ツモった瞬間に効果が出る特殊牌（activationTiming: 'draw'）
    if (tile.sp) {
      const def = (this.rules.specialTiles || []).find((d) => d.id === tile.sp);
      if (def && def.activationTiming === 'draw') {
        const bp = (def.effects || []).filter((e) => e.type === 'bonus')
          .reduce((a, e) => a + (e.value ?? 1), 0);
        if (bp) {
          p.bonus += bp;
          this.pushEvent({ type: 'specialDraw', seat, name: def.name, bonus: bp });
        }
      }
    }
    // 花牌を引いた場合。自分で抜く設定なら、抜かずに手番へ渡す
    if (isFlower(tile.t) && !this.rules.flowers.manualDraw) {
      this.resolveFlowersInHand(p, false);
      return p.drawn;
    }
    this.phase = 'turn';
    this.turn = seat;
    this.pending = { kind: 'turn', seat };
    return tile;
  }

  resolveFlowersInHand(p, atDeal) {
    let guard = 0;
    while (guard++ < 10) {
      const idx = p.hand.findIndex((t) => isFlower(t.t));
      if (idx < 0) break;
      const [f] = p.hand.splice(idx, 1);
      p.flowers.push(f);
      const eff = applyFlowerEffects(this.rules, [f], this.n, 'draw');
      this.applyEffect(p, eff, { immediateBonusOnly: true });
      this.pushEvent({
        type: 'flower', seat: p.seat, tile: this.tileInfo(f),
        label: FLOWER_LABEL[f.t], messages: eff.messages,
      });
      const rep = atDeal ? this.wall.draw() : this.wall.drawReplacement();
      if (!rep) {
        // 補充牌が尽きた（海底での花牌ツモ）→ その場で流局
        p.drawn = null;
        if (!atDeal) this.endKyokuByDraw();
        return;
      }
      p.hand.push(rep);
      if (!atDeal) {
        p.drawn = rep;
        this.pushEvent({ type: 'draw', seat: p.seat, tile: this.tileInfo(rep), replacement: true });
      }
    }
    if (!atDeal) {
      this.phase = 'turn';
      this.turn = p.seat;
      this.pending = { kind: 'turn', seat: p.seat };
    }
  }

  /** 即時ボーナス（花牌・北など）を反映 */
  applyEffect(p, eff, opts = {}) {
    if (eff.bonus) {
      p.bonus += eff.bonus;
      if (this.rules.bonus.enabled && opts.immediateBonusOnly) {
        // 「オール」扱いの支払いは他家からのゲーム内ポイント移動として表現
        for (const q of this.players) if (q !== p) q.bonus -= Math.round(eff.bonus / (this.n - 1));
      }
    }
    p.effectAcc = mergeInto(p.effectAcc, { ...eff, bonus: 0 });
  }

  // =========================================================================
  // 選択肢の生成
  // =========================================================================
  getChoices(seat) {
    if (this.finished) return [];
    if (this.pending && this.pending.kind === 'turn' && this.pending.seat === seat) return this.turnChoices(seat);
    if (this.pending && this.pending.kind === 'claim') {
      const c = this.pending.candidates.find((x) => x.seat === seat && !this.pending.responses.has(seat));
      return c ? c.options : [];
    }
    return [];
  }

  turnChoices(seat) {
    const p = this.players[seat];
    const R = this.rules;
    const out = [];
    const counts = countsFromTiles(p.hand);
    const meldCount = p.melds.length;

    // ツモ和了
    const win = this.checkWin(seat, p.drawn, true);
    if (win) out.push({ type: 'tsumo', label: 'ツモ', preview: win });

    // 九種九牌
    if (R.renchan.kyuushuKyuuhai && this.firstGoAround && p.discards.length === 0 && !this.anyCall) {
      const kinds = new Set(p.hand.filter((t) => isYaochu(t.t)).map((t) => t.t));
      if (kinds.size >= 9) out.push({ type: 'kyuushu', label: '九種九牌' });
    }

    // 北抜き・ガリ（三麻）。extraNukiTiles で一萬・五萬・九萬なども抜き牌にできる
    if (this.n === 3 && R.sanma.northMode === 'nuki') {
      for (const code of this.nukiTypes()) {
        const tile = p.hand.find((t) => t.t === code);
        if (tile) out.push({ type: 'kita', label: `${typeName(code)}抜き`, tileId: tile.id, t: code });
      }
    }

    // 華牌を抜く（自分で抜く設定のとき）。
    // 補充牌が無い海底では抜けない。抜くと手牌が1枚減ったまま局が終わる
    if (R.flowers.enabled && R.flowers.manualDraw && this.wall.remaining > 0) {
      for (const tile of p.hand) {
        if (isFlower(tile.t)) {
          out.push({
            type: 'flower', label: `華牌「${FLOWER_LABEL[tile.t]}」を抜く`,
            tileId: tile.id, t: tile.t,
          });
        }
      }
    }

    // 暗槓・加槓
    if (R.win.kan && this.kanCount < 4 && this.wall.remaining > 0) {
      const byType = {};
      for (const t of p.hand) byType[t.t] = (byType[t.t] || 0) + 1;
      for (const [ts, c] of Object.entries(byType)) {
        const t = Number(ts);
        if (c >= 4) {
          if (p.riichi && !R.win.ankanAfterRiichi) continue;
          if (p.riichi && !this.ankanKeepsWait(p, t)) continue;
          out.push({ type: 'kan', kind: 'ankan', t, label: `暗槓 ${typeName(t)}` });
        }
      }
      for (const m of p.melds) {
        if (m.kind !== 'pon') continue;
        const has = p.hand.find((t) => t.t === m.tiles[0].t);
        if (has && !p.riichi) out.push({ type: 'kan', kind: 'kakan', t: m.tiles[0].t, label: `加槓 ${typeName(m.tiles[0].t)}` });
      }
    }

    // リーチ
    if (!p.riichi && this.isMenzen(p) && p.points >= R.scoring.riichiStick
      && (this.wall.remaining >= 4 || R.win.riichiWithoutTsumoban)) {
      const options = [];
      for (const tile of this.uniqueTiles(p.hand)) {
        const rest = p.hand.filter((t) => t.id !== tile.id);
        if (shantenWithWild(countsFromTiles(rest), p.melds.length, this.wild, this.handOpts) === 0) options.push(tile.id);
      }
      if (options.length) {
        out.push({ type: 'riichi', label: 'リーチ', tileIds: options });
        if (R.local.openRiichi.enabled) out.push({ type: 'riichi', open: true, label: 'オープンリーチ', tileIds: options });
      }
    }

    // 打牌（リーチ後はツモ切り固定。手牌にない牌が指定されないよう必ず実体で確認する）
    const inHand = (t) => t && p.hand.some((h) => h.id === t.id);
    let discardable = p.riichi && inHand(p.drawn)
      ? [p.drawn]
      : this.uniqueTiles(p.hand).filter((t) => !this.isKuikaeBanned(p, t));
    if (!discardable.length) discardable = this.uniqueTiles(p.hand);
    out.push({ type: 'discard', label: '打牌', tileIds: discardable.map((t) => t.id) });
    return out;
  }

  uniqueTiles(hand) {
    const seen = new Set();
    const out = [];
    for (const t of hand) {
      const key = `${t.t}|${t.red}|${t.gold}|${t.dot}|${t.sp}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    return out;
  }

  isKuikaeBanned(p, tile) {
    if (this.rules.win.kuikae) return false;
    if (!p.lastCall) return false;
    const c = p.lastCall;
    if (p.discards.length && p.lastCallDiscarded) return false;
    if (tile.t === c.calledTile.t) return true;
    if (c.kind === 'chi') {
      const min = Math.min(...c.tiles.map((x) => x.t));
      const max = Math.max(...c.tiles.map((x) => x.t));
      if (min === c.calledTile.t + 1 && tile.t === max + 1) return true;
      if (max === c.calledTile.t - 1 && tile.t === min - 1) return true;
    }
    return false;
  }

  ankanKeepsWait(p, t) {
    const before = waits(countsFromTiles(p.hand.filter((x) => x.id !== p.drawn.id)), p.melds.length, this.handOpts).join(',');
    const rest = p.hand.filter((x) => x.t !== t);
    const after = waits(countsFromTiles(rest), p.melds.length + 1, this.handOpts).join(',');
    return before === after;
  }

  isMenzen(p) { return p.melds.every((m) => m.kind === 'kan' && m.concealed); }

  /** 抜き牌にできる牌タイプ（北＋店舗指定のガリ牌） */
  nukiTypes() {
    const out = [T.NORTH];
    for (const code of this.rules.sanma.extraNukiTiles || []) {
      try { out.push(codeToType(code)); } catch { /* 無効な指定は無視 */ }
    }
    return out;
  }

  // =========================================================================
  // 和了判定
  // =========================================================================
  /**
   * @returns {Object|null} 和了可能なら評価結果
   */
  checkWin(seat, winTile, tsumo, opts = {}) {
    if (!winTile) return null;
    const p = this.players[seat];
    const R = this.rules;
    const hand = tsumo ? p.hand : [...p.hand, winTile];
    let counts = countsFromTiles(hand);
    if (shanten(counts, p.melds.length, this.handOpts) !== -1) {
      // 少牌マイティ：足りない1枚を、いちばん高くなる牌として当てはめる
      if (this.wild > 0) {
        const best = this.tryMighty(seat, p, hand, winTile, tsumo, opts);
        if (best) return best;
      }
      // オールマイティ牌（白ポッチ・特殊牌）による和了を試す
      const almighty = almightyTiles(R, hand, this.flagsFor(p, tsumo, opts), tsumo);
      if (!almighty.length) return null;
      const sub = this.tryAlmighty(p, hand, almighty);
      if (!sub) return null;
      return this.evaluateWin(seat, winTile, tsumo, sub.hand, opts, sub.substituted);
    }
    return this.evaluateWin(seat, winTile, tsumo, hand, opts);
  }

  /**
   * 少牌マイティの1枚を当てはめる。
   * 和了形になる牌が複数あるときは、いちばん高くなるものを選ぶ。
   * （どれを選んでも和了なので、打ち手が損をしない側に寄せる）
   */
  tryMighty(seat, p, hand, winTile, tsumo, opts) {
    const counts = countsFromTiles(hand);
    let best = null;
    let bestScore = -Infinity;
    for (let t = 0; t < NUM_TYPES; t++) {
      if (counts[t] >= 4) continue;
      counts[t]++;
      const ok = shanten(counts, p.melds.length, this.handOpts) === -1;
      counts[t]--;
      if (!ok) continue;
      const virt = { id: `mighty-${p.seat}-${t}`, t, red: false, gold: false, dot: false, sp: null, wild: true, mighty: true };
      const res = this.evaluateWin(seat, winTile, tsumo, [...hand, virt], opts, { from: virt, to: t });
      if (!res) continue;
      const score = (res.isYakuman ? 1000 : 0) + (res.baseHan || 0) * 10 + (res.fu || 0) / 100;
      if (score > bestScore) { bestScore = score; best = res; }
    }
    return best;
  }

  tryAlmighty(p, hand, almighty) {
    for (const wild of almighty) {
      for (let t = 0; t < NUM_TYPES; t++) {
        const alt = hand.map((x) => (x.id === wild.id ? { ...x, t, wild: true } : x));
        if (shanten(countsFromTiles(alt), p.melds.length, this.handOpts) === -1) {
          return { hand: alt, substituted: { from: wild, to: t } };
        }
      }
    }
    return null;
  }

  flagsFor(p, tsumo, opts = {}) {
    return {
      riichi: p.riichi,
      doubleRiichi: p.doubleRiichi,
      openRiichi: p.openRiichi,
      ippatsu: p.ippatsu && !opts.noIppatsu,
      rinshan: !!opts.rinshan,
      chankan: !!opts.chankan,
      haitei: tsumo && this.wall.remaining === 0,
      houtei: !tsumo && this.wall.remaining === 0,
      tenhou: tsumo && this.firstGoAround && p.seat === this.round.dealer && p.discards.length === 0,
      chiihou: tsumo && this.firstGoAround && p.seat !== this.round.dealer && p.discards.length === 0 && !this.anyCall,
      renho: !tsumo && this.firstGoAround && p.seat !== this.round.dealer
        && p.discards.length === 0 && !this.anyCall,
      // 燕返し：放銃者のリーチ宣言牌をそのままロンした形
      tsubame: !tsumo && this.isRiichiDeclarationTile(this.lastDiscard),
      // 待ちの種類数（「お多福」のように待ちの広さで翻が変わる役で使う）
      waitKinds: opts.waitKinds ?? 0,
      furiten: !!(p.furiten || p.tempFuriten),
    };
  }

  /** その捨て牌が、捨てた本人のリーチ宣言牌かどうか */
  isRiichiDeclarationTile(last) {
    if (!last) return false;
    const from = this.players[last.seat];
    return !!from && !!from.riichiTileId && from.riichiTileId === last.tile.id;
  }

  doraTypes() {
    const R = this.rules;
    const out = [];
    for (const ind of this.wall.doraIndicators) out.push(doraNext(ind.t));
    for (const code of R.dora.permanentDora || []) out.push(codeToType(code));
    return out;
  }

  evaluateWin(seat, winTile, tsumo, hand, opts = {}, substituted = null) {
    const p = this.players[seat];
    // 和了牌を除いた形から待ちを数える。待ちの広さで翻が変わる役があるため
    if (opts.waitKinds === undefined) {
      const before = hand.filter((t) => t !== winTile);
      opts = { ...opts, waitKinds: waits(countsFromTiles(before), p.melds.length, this.handOpts).length };
    }
    const R = this.rules;
    const flags = this.flagsFor(p, tsumo, opts);
    const ctx = {
      hand,
      melds: p.melds,
      winTile,
      tsumo,
      seatWind: (seat - this.round.dealer + this.n) % this.n,
      roundWind: this.round.wind,
      flags,
      rules: R,
      handOpts: this.handOpts,
      doraTypes: this.doraTypes(),
      kitaCount: p.kita.length,
      flowerDoraCount: R.flowers.isDora ? p.flowers.length : 0,
      consecutiveWins: p.streak || 0,
    };
    const res = evaluate(ctx);
    if (!res) return null;
    if (!res.isYakuman) {
      // 役なし（ドラのみ）和了の禁止
      if ((res.baseHan || 0) < R.win.minHan) return null;
      // 完全先付け（後付け禁止）
      if (!R.win.atozuke && !this.yakuConfirmed(p, ctx)) return null;
    }
    res.ctx = ctx;
    res.substituted = substituted;
    return res;
  }

  /** 完全先付け判定（近似：全ての待ちで役が成立するか） */
  yakuConfirmed(p, ctx) {
    const base = p.hand.filter((t) => !ctx.tsumo || t.id !== ctx.winTile.id);
    const w = waits(countsFromTiles(base), p.melds.length, this.handOpts);
    if (w.length <= 1) return true;
    for (const t of w) {
      const fake = [...base, { id: -1, t, red: false, gold: false, dot: false, sp: null }];
      const r = evaluate({ ...ctx, hand: fake, winTile: fake[fake.length - 1] });
      if (!r) return false;
      if (!r.isYakuman && (r.baseHan || 0) < 1) return false;
    }
    return true;
  }

  // =========================================================================
  // 行動の適用
  // =========================================================================
  act(seat, action) {
    if (this.finished) return { error: '対局終了済み' };
    if (this.pending && this.pending.kind === 'claim') return this.respondClaim(seat, action);
    if (!this.pending || this.pending.seat !== seat) return { error: '手番ではありません' };
    const p = this.players[seat];
    const R = this.rules;

    switch (action.type) {
      case 'tsumo': {
        const win = this.checkWin(seat, p.drawn, true, { rinshan: this.lastWasRinshan });
        if (!win) return { error: 'ツモ和了できません' };
        this.applyWin(seat, win, null, true);
        return { ok: true };
      }
      case 'discard':
      case 'riichi': {
        let tileId = action.tileId;
        if (action.type === 'riichi') {
          if (!this.isMenzen(p)) return { error: 'リーチできません' };
          p.riichi = true;
          p.riichiIdx = p.discards.length;
          p.openRiichi = !!action.open;
          p.doubleRiichi = this.firstGoAround && p.discards.length === 0 && !this.anyCall;
          p.points -= R.scoring.riichiStick;
          this.round.kyotaku += 1;
          this.riichiDeclaredThisKyoku++;
          this.pushEvent({ type: 'riichi', seat, open: p.openRiichi, double: p.doubleRiichi });
        }
        const idx = p.hand.findIndex((t) => t.id === tileId);
        if (idx < 0) return { error: 'その牌を持っていません' };
        const [tile] = p.hand.splice(idx, 1);
        p.hand = sortTiles(p.hand);
        p.discards.push(tile);
        p.lastCallDiscarded = true;
        if (!isYaochu(tile.t)) p.nagashi = false;
        this.lastDiscard = { seat, tile };
        this.lastWasRinshan = false;
        this.discardSeq++;
        if (action.type === 'riichi') p.ippatsu = true;
        else if (p.ippatsu) p.ippatsu = false;
        this.updateFuriten(p);
        p.tempFuriten = false;
        p.drawn = null;
        // リーチ宣言牌は横に倒して置くので、どれだったか覚えておく
        if (action.type === 'riichi') p.riichiTileId = tile.id;
        this.pushEvent({ type: 'discard', seat, tile: this.tileInfo(tile), riichi: action.type === 'riichi' });
        return this.afterDiscard(seat, tile);
      }
      case 'kan': {
        return this.doKan(seat, action);
      }
      case 'flower': {
        const idx = p.hand.findIndex((t) => isFlower(t.t)
          && (action.tileId === undefined || t.id === action.tileId));
        if (idx < 0) return { error: '華牌がありません' };
        // 抜く処理は自動のときと同じ。抜いた瞬間に効果が出て、補充を1枚引く。
        // 手番の設定も resolveFlowersInHand の中で行われる
        this.resolveFlowersInHand(p, false);
        return { ok: true };
      }
      case 'kita': {
        const want = action.t !== undefined ? action.t : T.NORTH;
        const idx = p.hand.findIndex((t) => t.t === want);
        if (idx < 0) return { error: '北がありません' };
        const [tile] = p.hand.splice(idx, 1);
        p.kita.push(tile);
        p.bonus += R.sanma.kitaBonus || 0;
        if (R.sanma.kitaBreaksIppatsu) for (const q of this.players) q.ippatsu = false;
        this.lastWasRinshan = !!R.sanma.kitaIsRinshan;
        this.pushEvent({ type: 'kita', seat, tile: this.tileInfo(tile), count: p.kita.length });
        // 四北のサイコロトリガー
        if (p.kita.length >= 4) this.pendingDiceTriggers = [...(this.pendingDiceTriggers || []), 'fourKita'];
        const rep = this.wall.drawReplacement();
        if (!rep) { this.endKyokuByDraw(); return { ok: true }; }
        p.hand.push(rep);
        p.drawn = rep;
        p.hand = sortTiles(p.hand);
        this.pushEvent({ type: 'draw', seat, tile: this.tileInfo(rep), replacement: true });
        if (isFlower(rep.t)) this.resolveFlowersInHand(p, false);
        this.pending = { kind: 'turn', seat };
        return { ok: true };
      }
      case 'kyuushu': {
        this.pushEvent({ type: 'abort', reason: '九種九牌' });
        this.endKyokuAbort('九種九牌');
        return { ok: true };
      }
      default:
        return { error: `未知の行動: ${action.type}` };
    }
  }

  doKan(seat, action) {
    const p = this.players[seat];
    const R = this.rules;
    if (action.kind === 'ankan') {
      const tiles = p.hand.filter((t) => t.t === action.t).slice(0, 4);
      if (tiles.length < 4) return { error: '暗槓できません' };
      p.hand = p.hand.filter((t) => !tiles.includes(t));
      p.melds.push({ kind: 'kan', tiles, concealed: true, from: seat, calledTile: tiles[0] });
    } else if (action.kind === 'kakan') {
      const meld = p.melds.find((m) => m.kind === 'pon' && m.tiles[0].t === action.t);
      if (!meld) return { error: '加槓できません' };
      const idx = p.hand.findIndex((t) => t.t === action.t);
      const [tile] = p.hand.splice(idx, 1);
      meld.kind = 'kan';
      meld.concealed = false;
      meld.tiles.push(tile);
      // 搶槓チェック
      const chankan = this.collectRonCandidates(seat, tile, { chankan: true });
      if (chankan.length) {
        this.pushEvent({ type: 'chankanChance', seat });
        this.pending = {
          kind: 'claim', tile, from: seat, chankan: true,
          candidates: chankan, responses: new Map(),
        };
        return { ok: true };
      }
    } else {
      return { error: '不正な槓' };
    }
    this.kanCount++;
    for (const q of this.players) q.ippatsu = false;
    this.pushEvent({ type: 'kan', seat, kind: action.kind, t: action.t });
    if (R.renchan.suukaikan && this.kanCount >= 4) {
      const kanSeats = new Set();
      for (const q of this.players) for (const m of q.melds) if (m.kind === 'kan') kanSeats.add(q.seat);
      if (kanSeats.size > 1) { this.endKyokuAbort('四開槓'); return { ok: true }; }
    }
    if (R.dora.kanDora) {
      const t = this.wall.revealDora();
      if (t) this.pushEvent({ type: 'kanDora', tile: this.tileInfo(t) });
    }
    const rep = this.wall.drawReplacement();
    if (!rep) { this.endKyokuByDraw(); return { ok: true }; }
    p.hand.push(rep);
    p.drawn = rep;
    p.hand = sortTiles(p.hand);
    this.lastWasRinshan = true;
    this.pushEvent({ type: 'draw', seat, tile: this.tileInfo(rep), replacement: true });
    if (isFlower(rep.t)) this.resolveFlowersInHand(p, false);
    this.pending = { kind: 'turn', seat };
    return { ok: true };
  }

  updateFuriten(p) {
    const w = waits(countsFromTiles(p.hand), p.melds.length, this.handOpts);
    p.waits = w;
    p.furiten = p.discards.some((d) => w.includes(d.t));
  }

  // =========================================================================
  // 打牌後の鳴き・ロン処理
  // =========================================================================
  afterDiscard(seat, tile) {
    const R = this.rules;
    // 四風連打
    if (R.renchan.suufonRenda && this.n === 4 && this.firstGoAround && this.discardSeq === 4) {
      const firsts = this.players.map((q) => q.discards[0]);
      if (firsts.every((d) => d && d.t >= T.EAST && d.t <= T.NORTH && d.t === firsts[0].t)) {
        this.endKyokuAbort('四風連打');
        return { ok: true };
      }
    }
    // 四人立直
    if (R.renchan.suuchaRiichi && this.riichiDeclaredThisKyoku >= this.n) {
      this.endKyokuAbort(this.n === 3 ? '三人立直' : '四人立直');
      return { ok: true };
    }

    const candidates = [];
    const ron = this.collectRonCandidates(seat, tile, {});
    for (const r of ron) candidates.push(r);
    for (let i = 1; i < this.n; i++) {
      const s = (seat + i) % this.n;
      const p = this.players[s];
      if (p.riichi) continue;
      const opts = [];
      const same = p.hand.filter((t) => t.t === tile.t);
      if (R.win.pon && same.length >= 2) {
        opts.push({ type: 'pon', label: `ポン ${typeName(tile.t)}`, tileIds: same.slice(0, 2).map((t) => t.id), variants: this.ponVariants(same) });
      }
      if (R.win.kan && same.length >= 3 && this.kanCount < 4) {
        opts.push({ type: 'kan', kind: 'daiminkan', label: `カン ${typeName(tile.t)}`, t: tile.t });
      }
      if (R.win.chi && i === 1 && tile.t < 27) {
        for (const v of this.chiVariants(p, tile)) {
          opts.push({ type: 'chi', label: `チー ${v.map((x) => typeName(x.t)).join('')}`, tileIds: v.map((x) => x.id) });
        }
      }
      if (opts.length) {
        const exist = candidates.find((c) => c.seat === s);
        if (exist) exist.options.push(...opts);
        else candidates.push({ seat: s, options: [...opts, { type: 'pass', label: 'スルー' }] });
      }
    }
    for (const c of candidates) if (!c.options.some((o) => o.type === 'pass')) c.options.push({ type: 'pass', label: 'スルー' });

    if (candidates.length) {
      candidates.sort((a, b) => this.claimOrder(seat, a.seat) - this.claimOrder(seat, b.seat));
      this.pending = { kind: 'claim', tile, from: seat, candidates, responses: new Map() };
      return { ok: true };
    }
    return this.proceedAfterNoClaim(seat);
  }

  claimOrder(from, seat) { return (seat - from + this.n) % this.n; }

  ponVariants(same) {
    // 赤牌を含めるかの選択肢
    const out = [];
    if (same.length >= 3) {
      out.push(same.slice(0, 2).map((t) => t.id));
      out.push([same[0].id, same[2].id]);
    }
    return out;
  }

  chiVariants(p, tile) {
    const out = [];
    const t = tile.t;
    const find = (x) => p.hand.find((h) => h.t === x);
    const combos = [[t - 2, t - 1], [t - 1, t + 1], [t + 1, t + 2]];
    for (const [a, b] of combos) {
      if (a < 0 || b < 0) continue;
      if (Math.floor(a / 9) !== Math.floor(t / 9) || Math.floor(b / 9) !== Math.floor(t / 9)) continue;
      if (a >= 27 || b >= 27) continue;
      const ta = find(a), tb = find(b);
      if (ta && tb) out.push([ta, tb]);
    }
    return out;
  }

  collectRonCandidates(from, tile, opts) {
    const out = [];
    const R = this.rules;
    for (let i = 1; i < this.n; i++) {
      const s = (from + i) % this.n;
      const p = this.players[s];
      if (p.furiten || p.tempFuriten) continue;
      if (!p.waits) this.updateFuriten(p);
      const w = p.waits || [];
      if (!w.includes(tile.t) && !opts.chankan) {
        // オールマイティ牌がある場合のみ再判定
        if (!almightyTiles(R, [...p.hand, tile], this.flagsFor(p, false), false).length) continue;
      }
      const win = this.checkWin(s, tile, false, opts);
      if (!win) continue;
      out.push({
        seat: s,
        options: [{ type: 'ron', label: 'ロン', preview: win }, { type: 'pass', label: 'スルー' }],
        win,
      });
    }
    return out;
  }

  respondClaim(seat, action) {
    const pd = this.pending;
    const cand = pd.candidates.find((c) => c.seat === seat);
    if (!cand) return { error: '応答権がありません' };
    if (pd.responses.has(seat)) return { error: '既に応答済み' };
    pd.responses.set(seat, action);
    if (pd.responses.size < pd.candidates.length) return { ok: true, waiting: true };
    return this.resolveClaims();
  }

  resolveClaims() {
    const pd = this.pending;
    const R = this.rules;
    const rons = pd.candidates.filter((c) => pd.responses.get(c.seat)?.type === 'ron');
    if (rons.length) {
      if (rons.length > 1 && this.n === 3 && R.win.tripleRon === 'draw' && rons.length >= 2 && this.n === 3) {
        // 三麻の二家和は設定次第。既定はダブロン許容。
      }
      if (rons.length >= 3 && R.win.tripleRon === 'draw') {
        this.endKyokuAbort('三家和');
        return { ok: true };
      }
      const winners = (R.win.doubleRon && !R.win.headBump) ? rons : [rons[0]];
      this.applyMultiWin(winners, pd.from, pd.tile);
      return { ok: true };
    }
    // ロンを見逃した player は同順フリテン
    for (const c of pd.candidates) {
      if (c.win && pd.responses.get(c.seat)?.type === 'pass') {
        this.players[c.seat].tempFuriten = true;
        if (this.players[c.seat].riichi && R.win.riichiMiss === 'furiten') this.players[c.seat].furiten = true;
      }
    }
    if (pd.chankan) {
      // 搶槓されなかった → 槓成立を続行
      const p = this.players[pd.from];
      this.kanCount++;
      for (const q of this.players) q.ippatsu = false;
      if (R.dora.kanDora) {
        const t = this.wall.revealDora();
        if (t) this.pushEvent({ type: 'kanDora', tile: this.tileInfo(t) });
      }
      const rep = this.wall.drawReplacement();
      if (!rep) { this.endKyokuByDraw(); return { ok: true }; }
      p.hand.push(rep); p.drawn = rep; p.hand = sortTiles(p.hand);
      this.lastWasRinshan = true;
      this.pushEvent({ type: 'draw', seat: pd.from, tile: this.tileInfo(rep), replacement: true });
      this.pending = { kind: 'turn', seat: pd.from };
      return { ok: true };
    }

    // 鳴き（ポン・カン・チー）
    const priority = { kan: 3, pon: 2, chi: 1 };
    let best = null;
    for (const c of pd.candidates) {
      const a = pd.responses.get(c.seat);
      if (!a || !priority[a.type]) continue;
      const score = priority[a.type] * 10 - this.claimOrder(pd.from, c.seat);
      if (!best || score > best.score) best = { seat: c.seat, action: a, score };
    }
    if (best) return this.applyCall(best.seat, best.action, pd.from, pd.tile);
    return this.proceedAfterNoClaim(pd.from);
  }

  applyCall(seat, action, from, tile) {
    const p = this.players[seat];
    this.anyCall = true;
    this.firstGoAround = false;
    for (const q of this.players) q.ippatsu = false;
    const take = (ids) => {
      const tiles = [];
      for (const id of ids) {
        const i = p.hand.findIndex((t) => t.id === id);
        if (i >= 0) tiles.push(...p.hand.splice(i, 1));
      }
      return tiles;
    };
    if (action.type === 'pon') {
      const tiles = take(action.tileIds);
      p.melds.push({ kind: 'pon', tiles: [...tiles, tile], concealed: false, from, calledTile: tile });
      p.lastCall = { kind: 'pon', tiles: [...tiles, tile], calledTile: tile };
    } else if (action.type === 'chi') {
      const tiles = take(action.tileIds);
      p.melds.push({ kind: 'chi', tiles: [...tiles, tile], concealed: false, from, calledTile: tile });
      p.lastCall = { kind: 'chi', tiles: [...tiles, tile], calledTile: tile };
    } else if (action.type === 'kan') {
      const same = p.hand.filter((t) => t.t === tile.t).slice(0, 3);
      p.hand = p.hand.filter((t) => !same.includes(t));
      p.melds.push({ kind: 'kan', tiles: [...same, tile], concealed: false, from, calledTile: tile });
      this.kanCount++;
      if (this.rules.dora.kanDora) {
        const t = this.wall.revealDora();
        if (t) this.pushEvent({ type: 'kanDora', tile: this.tileInfo(t) });
      }
    }
    // 鳴かれた牌は捨て牌から除く
    const fp = this.players[from];
    const di = fp.discards.findIndex((t) => t.id === tile.id);
    if (di >= 0) fp.discards.splice(di, 1);
    fp.nagashi = false;
    p.hand = sortTiles(p.hand);
    p.lastCallDiscarded = false;
    this.pushEvent({ type: 'call', seat, kind: action.type, from, tile: this.tileInfo(tile) });

    if (action.type === 'kan') {
      const rep = this.wall.drawReplacement();
      if (!rep) { this.endKyokuByDraw(); return { ok: true }; }
      p.hand.push(rep); p.drawn = rep; p.hand = sortTiles(p.hand);
      this.lastWasRinshan = true;
      this.pushEvent({ type: 'draw', seat, tile: this.tileInfo(rep), replacement: true });
      if (isFlower(rep.t)) this.resolveFlowersInHand(p, false);
    } else {
      p.drawn = null;
    }
    this.turn = seat;
    this.phase = 'turn';
    this.pending = { kind: 'turn', seat };
    return { ok: true };
  }

  proceedAfterNoClaim(from) {
    if (this.wall.remaining <= 0) { this.endKyokuByDraw(); return { ok: true }; }
    const next = (from + 1) % this.n;
    if (next === this.round.dealer) this.firstGoAround = this.firstGoAround && this.discardSeq < this.n;
    if (this.discardSeq >= this.n) this.firstGoAround = false;
    this.drawTile(next, false);
    return { ok: true };
  }

  // =========================================================================
  // 和了処理
  // =========================================================================
  applyWin(seat, win, loser, tsumo) {
    this.applyMultiWin([{ seat, win }], loser, null, tsumo);
  }

  applyMultiWin(winners, loser, tile, tsumo = false) {
    const R = this.rules;
    const deltas = new Array(this.n).fill(0);
    const details = [];
    let kyotaku = this.round.kyotaku;

    for (const w of winners) {
      const seat = w.seat;
      const p = this.players[seat];
      const win = w.win;
      const isTsumo = tsumo;

      // --- 特殊牌・花牌・カスタムルールの効果を集計
      const allTiles = [...win.ctx.hand, ...p.melds.flatMap((m) => m.tiles)];
      const effCtx = {
        allTiles, menzen: this.isMenzen(p), tsumo: isTsumo, flags: win.ctx.flags,
        han: win.han, yakuman: win.yakuman, isDealer: seat === this.round.dealer,
        kitaCount: p.kita.length, flowerCount: p.flowers.length,
      };
      const eff = emptyEffect();
      mergeInto(eff, applySpecialTiles(R, effCtx));
      mergeInto(eff, applyFlowerEffects(R, p.flowers, this.n, 'win'));
      mergeInto(eff, runCustomRules(R, 'win', effCtx, this.rng));
      // 秋（5牌ダブドラ）
      if (eff.doubleFives) {
        for (const t of allTiles) if (numOf(t.t) === 5) eff.extraDora += 1;
      }
      for (const dt of eff.doubleDoraTypes) {
        for (const t of allTiles) if (t.t === dt) eff.extraDora += 1;
      }

      // --- 裏ドラ
      let uraCount = 0;
      if (p.riichi && R.dora.ura) {
        const uraTypes = this.wall.uraIndicators
          .slice(0, R.dora.kanUra ? this.wall.uraIndicators.length : R.dora.indicators)
          .map((t) => doraNext(t.t));
        for (const t of allTiles) for (const u of uraTypes) if (t.t === u) uraCount++;
      }

      const totalHan = win.han + eff.extraDora + eff.extraHan + uraCount;
      const handForScore = {
        han: totalHan, fu: win.fu,
        yakuman: win.yakuman + (eff.forceYakuman || 0),
        nukiCount: p.kita.length,
      };
      const bp = basePoints(handForScore, R, eff.rankUp);
      if (eff.scoreMultiply && eff.scoreMultiply !== 1) {
        bp.base = Math.round(bp.base * eff.scoreMultiply);
        if (bp.pointsPerPayer) bp.pointsPerPayer = Math.round(bp.pointsPerPayer * eff.scoreMultiply);
      }

      const s = settleWin({
        base: bp.base,
        pointsPerPayer: bp.pointsPerPayer ?? null,
        winner: seat,
        loser,
        tsumo: isTsumo,
        dealerSeat: this.round.dealer,
        playerCount: this.n,
        rules: R,
        honba: winners.indexOf(w) === 0 ? this.round.honba : 0,
        kyotaku: winners.indexOf(w) === 0 ? kyotaku : 0,
        wareme: this.wareme,
      });
      if (winners.indexOf(w) === 0) kyotaku = 0;
      for (let i = 0; i < this.n; i++) deltas[i] += s.deltas[i];

      // --- ゲーム内ボーナスポイント（非換金）
      const bonusInfo = collectWinBonus(R, {
        flags: win.ctx.flags,
        uraCount,
        akaCount: allTiles.filter((t) => t.red).length,
        goldCount: allTiles.filter((t) => t.gold).length,
        pocchiCount: allTiles.filter((t) => t.dot).length,
        kitaCount: p.kita.length,
        yakuman: handForScore.yakuman,
        limitName: bp.limitName,
        tsumo: isTsumo,
      });
      let bonus = bonusInfo.bonus + eff.bonus;

      // --- アリス / チューリップ
      const flipCtx = {
        handTiles: win.ctx.hand, winTile: win.ctx.winTile,
        menzen: this.isMenzen(p), tsumo: isTsumo, flags: win.ctx.flags,
      };
      const aliceCfg = { ...R.local.alice };
      if (eff.aliceTrigger && !aliceCfg.enabled) {
        aliceCfg.enabled = true;
        aliceCfg.bonusPerMatch = eff.aliceTrigger;
      }
      if (this.debug.forceAlice) {
        // 検証用：めくり列の先頭を必ず手牌の牌にする（デバッグ時のみ牌を複製する）
        aliceCfg.enabled = true;
        aliceCfg.requireMenzen = false;
        const idx = 4 + this.wall.revealed * 2;
        if (idx < this.wall.deadSize) this.wall.dead[idx] = { ...win.ctx.hand[0], id: -990 };
      }
      const alice = runFlipBonus(aliceCfg, this.wall, flipCtx, 'アリス', 1);
      const tulipCfg = { ...R.local.tulip };
      if (eff.tulipTrigger && !tulipCfg.enabled) {
        tulipCfg.enabled = true;
        tulipCfg.bonusPerMatch = eff.tulipTrigger;
      }
      const tulip = runFlipBonus(tulipCfg, this.wall, flipCtx, 'チューリップ', 1);
      bonus += alice.bonus + tulip.bonus;

      // --- サイコロチャンス
      const triggers = [...(this.pendingDiceTriggers || [])];
      if (handForScore.yakuman > 0) triggers.push('yakuman');
      if (bp.limitName === '数え役満') triggers.push('countedYakuman');
      if (p.flowers.length >= 4) triggers.push('fourFlower');
      if (p.kita.length >= 4) triggers.push('fourKita');
      if (allTiles.some((t) => t.dot) && isTsumo) triggers.push('pocchiTsumo');
      if (eff.diceTrigger) triggers.push(...(R.local.dice.triggers || []), 'special');
      if (this.debug.forceDice) triggers.push(...R.local.dice.triggers);
      const diceCfg = eff.diceTrigger
        ? { ...R.local.dice, enabled: true, triggers: [...(R.local.dice.triggers || []), 'special'] }
        : R.local.dice;
      const dice = rollDiceBonus(diceCfg, this.rng, triggers);
      bonus += dice.bonus;

      if (eff.bonusMultiply) bonus = Math.round(bonus * eff.bonusMultiply);
      const bonusTotal = R.bonus.tsumoAll && isTsumo ? bonus * (this.n - 1) : bonus;
      p.bonus += bonusTotal;
      if (isTsumo) {
        for (const q of this.players) if (q.seat !== seat) q.bonus -= bonus;
      } else if (loser != null) {
        this.players[loser].bonus -= bonusTotal;
      }

      p.wins++;
      p.streak = (p.streak || 0) + 1;
      for (const q of this.players) if (q.seat !== seat) q.streak = 0;
      details.push({
        seat,
        yaku: win.yaku,
        han: totalHan,
        fu: win.fu,
        yakuman: handForScore.yakuman,
        limitName: bp.limitName,
        base: bp.base,
        tsumo: isTsumo,
        doraDetail: win.doraDetail,
        uraCount,
        rankUp: eff.rankUp,
        extraHan: eff.extraHan,
        extraDora: eff.extraDora,
        bonus: bonusTotal,
        bonusDetail: [...bonusInfo.detail, ...eff.messages, ...alice.messages, ...tulip.messages, ...dice.messages],
        aliceFlips: [...alice.aliceFlips, ...tulip.aliceFlips].map((f) => ({ tile: this.tileInfo(f.tile), matched: f.matched, label: f.label })),
        diceRolls: dice.diceRolls,
        substituted: win.substituted
          ? {
            from: tileName(win.substituted.from),
            to: typeName(win.substituted.to),
            // 少牌マイティは「元の牌」が無い（足りない1枚を当てはめている）
            mighty: !!win.substituted.from.mighty,
          }
          : null,
        payments: s.detail.payments,
        // 結果画面で「どんな手で和了ったか」を見せるための表示用データ
        handTiles: sortTiles(win.ctx.hand.filter((t) => t !== win.ctx.winTile)).map((t) => this.tileInfo(t)),
        winTile: this.tileInfo(win.ctx.winTile),
        meldsView: p.melds.map((m) => ({ type: m.type, tiles: m.tiles.map((t) => this.tileInfo(t)) })),
        gain: s.deltas[seat],
      });
    }

    for (let i = 0; i < this.n; i++) this.players[i].points += deltas[i];
    this.round.kyotaku = kyotaku;
    this.pendingDiceTriggers = [];
    this.lastWinnerSeat = winners.length ? winners[0].seat : this.lastWinnerSeat;
    const dealerWon = winners.some((w) => w.seat === this.round.dealer);
    this.finishKyoku({ kind: 'win', details, deltas, dealerWon, loser, tsumo });
  }

  // =========================================================================
  // 流局・局終了・対局終了
  // =========================================================================
  endKyokuByDraw() {
    const R = this.rules;
    const tenpai = [];
    for (const p of this.players) {
      const s = shantenWithWild(countsFromTiles(p.hand), p.melds.length, this.wild, this.handOpts);
      const w = waitsWithWild(countsFromTiles(p.hand), p.melds.length, this.wild, this.handOpts);
      let isTenpai = s === 0;
      if (isTenpai && !R.win.formalTenpai) {
        const hasYaku = true; // 形式テンパイ非採用の厳密判定は将来対応（要検討）
        isTenpai = hasYaku;
      }
      if (isTenpai && !R.win.junkara) {
        const visible = this.visibleCount(w);
        if (visible >= 4 * w.length) isTenpai = false;
      }
      p.tenpai = isTenpai;
      if (isTenpai) tenpai.push(p.seat);
    }
    // 流し満貫
    const nagashi = R.ryuukyoku.nagashiMangan
      ? this.players.filter((p) => p.nagashi && p.discards.length > 0)
      : [];
    let deltas = new Array(this.n).fill(0);
    if (nagashi.length) {
      for (const p of nagashi) {
        const isDealer = p.seat === this.round.dealer;
        // 流し満貫。役満として払う店もある
        const s = settleWin({
          base: R.ryuukyoku.nagashiYakuman ? 8000 : 2000,
          winner: p.seat, loser: null, tsumo: true,
          dealerSeat: this.round.dealer, playerCount: this.n, rules: R,
          honba: this.round.honba, kyotaku: 0, wareme: this.wareme,
        });
        for (let i = 0; i < this.n; i++) deltas[i] += s.deltas[i];
      }
    } else {
      deltas = settleNoten(tenpai, this.n, R);
    }
    for (let i = 0; i < this.n; i++) this.players[i].points += deltas[i];
    const dealerTenpai = tenpai.includes(this.round.dealer);
    this.finishKyoku({
      kind: 'draw', tenpai, deltas, dealerTenpai,
      nagashi: nagashi.map((p) => p.seat),
      reason: nagashi.length ? '流し満貫' : '流局',
    });
  }

  visibleCount(types) {
    let n = 0;
    for (const p of this.players) {
      for (const d of p.discards) if (types.includes(d.t)) n++;
      for (const m of p.melds) for (const t of m.tiles) if (types.includes(t.t)) n++;
    }
    for (const ind of this.wall.doraIndicators) if (types.includes(ind.t)) n++;
    return n;
  }

  endKyokuAbort(reason) {
    this.pushEvent({ type: 'abort', reason });
    this.finishKyoku({ kind: 'abort', reason, deltas: new Array(this.n).fill(0), dealerTenpai: true });
  }

  finishKyoku(res) {
    const R = this.rules;
    res.wind = this.round.wind;
    res.kyoku = this.round.kyoku;
    res.honba = this.round.honba;
    res.points = this.players.map((p) => p.points);
    res.bonus = this.players.map((p) => p.bonus);
    this.kyokuEnd = res;
    this.phase = 'kyokuEnd';
    this.pending = null;
    this.pushEvent({ type: 'kyokuEnd', result: res });

    // 連荘判定
    let dealerKeeps = false;
    if (res.kind === 'win') {
      if (R.renchan.dealerRepeat === 'always') dealerKeeps = true;
      else if (R.renchan.dealerRepeat === 'agari') dealerKeeps = res.dealerWon;
      else if (R.renchan.dealerRepeat === 'tenpai') dealerKeeps = res.dealerWon;
    } else {
      if (R.renchan.dealerRepeat === 'always') dealerKeeps = true;
      else if (R.renchan.dealerRepeat === 'tenpai') dealerKeeps = !!res.dealerTenpai;
      else if (R.renchan.dealerRepeat === 'agari') dealerKeeps = res.kind === 'abort';
      if (this.n === 3 && R.sanma.dealerRepeatOnRyuukyoku) dealerKeeps = true;
    }
    res.dealerKeeps = dealerKeeps;
    this.nextKyokuPlan = dealerKeeps
      ? { honba: this.round.honba + 1, advance: false }
      : { honba: (res.kind === 'win' ? 0 : this.round.honba + 1), advance: true };
    if (res.kind === 'win' && !dealerKeeps) this.nextKyokuPlan.honba = 0;
    if (res.kind === 'abort') this.nextKyokuPlan = { honba: this.round.honba + 1, advance: false };

    this.checkGameEnd(res);
  }

  isLastKyoku() {
    const R = this.rules;
    const last = R.game.length === 'east' ? 0 : 1;
    return this.round.wind >= last && this.round.kyoku >= this.n;
  }

  checkGameEnd(res) {
    const R = this.rules;
    const top = [...this.players].sort((a, b) => b.points - a.points)[0];
    // トビ
    const busted = this.players.some((p) => (R.game.tobiZeroIsEnd ? p.points <= 0 : p.points < 0));
    if (R.game.tobiEnd && busted) { this.endGame('トビ終了'); return; }
    // 点数の打ち切り（四万点クビなど）。到達した局で終わる
    const cap = R.game.pointCapEnd;
    if (cap && cap.enabled && cap.points > 0 && this.players.some((p) => p.points >= cap.points)) {
      this.endGame(`${cap.points}点で終了`); return;
    }
    if (R.game.length === 'ikkyoku') { this.endGame('一局清算'); return; }
    if (this.kyokuCount >= R.game.maxKyoku) { this.endGame('上限局数'); return; }

    if (this.isLastKyoku()) {
      const dealerIsTop = top.seat === this.round.dealer;
      const enough = top.points >= R.scoring.returnPoints;
      if (res.kind === 'win' && res.dealerWon && R.game.agariYame && dealerIsTop && enough) {
        this.endGame('アガリやめ'); return;
      }
      if (res.kind === 'draw' && res.dealerTenpai && R.game.tenpaiYame && dealerIsTop && enough) {
        this.endGame('テンパイやめ'); return;
      }
      if (!res.dealerKeeps) {
        if (!enough && R.game.westEntry) return;      // 西入して続行
        if (!enough && !R.game.westEntry) { this.endGame('規定局数終了'); return; }
        this.endGame('規定局数終了'); return;
      }
      if (res.dealerKeeps && enough && dealerIsTop && R.game.agariYame && res.kind === 'win') {
        this.endGame('アガリやめ'); return;
      }
    }
  }

  nextKyoku() {
    if (this.finished) return false;
    const plan = this.nextKyokuPlan || { honba: 0, advance: true };
    this.round.honba = plan.honba;
    if (plan.advance) {
      // 東天紅系：前局の和了者が次局の親になる
      if (this.rules.game.dealerRule === 'winner' && this.lastWinnerSeat != null) {
        this.round.dealer = this.lastWinnerSeat;
      } else {
        this.round.dealer = (this.round.dealer + 1) % this.n;
      }
      this.round.kyoku++;
      if (this.round.kyoku > this.n) {
        this.round.kyoku = 1;
        if (!this.rules.game.alwaysEast) this.round.wind++;
      }
    }
    this.anyCall = false;
    this.startKyoku();
    return true;
  }

  endGame(reason) {
    const R = this.rules;
    this.finished = true;
    // 焼き鳥・順位ビンタ・トビ賞（すべてゲーム内ボーナス）
    if (R.local.yakitori.enabled) {
      for (const p of this.players) if (p.wins === 0) p.bonus -= R.local.yakitori.penalty;
    }
    if (R.local.binta.enabled) {
      const order = [...this.players].sort((a, b) => b.points - a.points);
      order.forEach((p, i) => { p.bonus += R.local.binta.perRank[i] ?? 0; });
    }
    if (R.local.tobiBonus.enabled) {
      const busted = this.players.filter((p) => p.points < 0);
      if (busted.length) {
        const top = [...this.players].sort((a, b) => b.points - a.points)[0];
        for (const b of busted) { b.bonus -= R.local.tobiBonus.value; top.bonus += R.local.tobiBonus.value; }
      }
    }
    const finals = finalScores(this.players.map((p) => p.points), R);
    this.result = {
      reason,
      finals: finals.map((f) => ({ ...f, name: this.players[f.seat].name, bonus: this.players[f.seat].bonus })),
      kyokuCount: this.kyokuCount,
    };
    this.pushEvent({ type: 'gameEnd', result: this.result });
  }

  // =========================================================================
  // 進行ドライバ
  // =========================================================================
  /**
   * CPU の手番を自動で消化し、人間の入力が必要になったら止まる。
   * @param {Function} aiDecide (engine, seat, choices) => action
   * @returns {{waiting:{seat,choices}|null, kyokuEnd:Object|null, finished:boolean}}
   */
  advance(aiDecide, maxSteps = 4000) {
    let steps = 0;
    while (steps++ < maxSteps) {
      if (this.finished) return { waiting: null, finished: true, kyokuEnd: this.kyokuEnd };
      if (this.phase === 'kyokuEnd') return { waiting: null, finished: false, kyokuEnd: this.kyokuEnd };
      if (!this.pending) return { waiting: null, finished: false, kyokuEnd: null };
      let seat;
      if (this.pending.kind === 'turn') seat = this.pending.seat;
      else {
        const c = this.pending.candidates.find((x) => !this.pending.responses.has(x.seat));
        if (!c) { this.resolveClaims(); continue; }
        seat = c.seat;
      }
      const p = this.players[seat];
      const choices = this.getChoices(seat);
      if (!choices.length) {
        if (this.pending.kind === 'claim') { this.pending.responses.set(seat, { type: 'pass' }); continue; }
        return { waiting: null, finished: false, kyokuEnd: null, error: '選択肢なし' };
      }
      if (!p.isCpu) return { waiting: { seat, choices }, finished: false, kyokuEnd: null };
      const action = aiDecide(this, seat, choices);
      // 決め手を返さないときは、その席で止めて外に委ねる。
      // オンライン対戦で「AIの手も配信元がまとめて決める」ために使う。
      if (!action) return { waiting: { seat, choices }, finished: false, kyokuEnd: null };
      const r = this.act(seat, action);
      if (r && r.error) {
        // フォールバック：適当に打牌
        const d = choices.find((c) => c.type === 'discard');
        if (d) this.act(seat, { type: 'discard', tileId: d.tileIds[0] });
        else if (this.pending.kind === 'claim') this.act(seat, { type: 'pass' });
        else return { waiting: null, finished: false, kyokuEnd: null, error: r.error };
      }
    }
    return { waiting: null, finished: false, kyokuEnd: null, error: 'ステップ上限' };
  }

  // =========================================================================
  // デバッグ用の操作（検証専用。牌の同一性を壊す操作は forceAlice のみ）
  // =========================================================================
  /** 次のツモを条件に合う牌に差し替える */
  debugForceNextDraw(pred) {
    const w = this.wall;
    for (let i = w.drawIndex; i < w.liveEnd; i++) {
      if (pred(w.live[i])) {
        [w.live[w.drawIndex], w.live[i]] = [w.live[i], w.live[w.drawIndex]];
        return true;
      }
    }
    for (let i = w.rinshanUsed; i < w.deadSize; i++) {
      if (pred(w.dead[i])) {
        const t = w.dead[i];
        w.dead[i] = w.live[w.drawIndex];
        w.live[w.drawIndex] = t;
        return true;
      }
    }
    return false;
  }

  /** 手牌に条件に合う牌を差し込む（山の牌と交換するので総数は保存される） */
  debugInjectToHand(seat, pred) {
    const p = this.players[seat];
    const w = this.wall;
    for (let i = w.drawIndex; i < w.liveEnd; i++) {
      if (!pred(w.live[i])) continue;
      const target = p.hand.findIndex((t) => !t.red && !t.gold && !t.dot && !t.sp);
      if (target < 0) return false;
      const tmp = p.hand[target];
      p.hand[target] = w.live[i];
      w.live[i] = tmp;
      p.hand = sortTiles(p.hand);
      return true;
    }
    return false;
  }

  debugSetPoints(arr) {
    this.players.forEach((p, i) => { if (arr[i] != null) p.points = arr[i]; });
  }

  debugSetDora(code) {
    const t = codeToType(code);
    const idx = 0;
    if (!this.wall.doraIndicators.length) return false;
    // 表示牌を「指定牌の1つ前」にすることで、指定牌をドラにする
    let prev = t;
    for (let i = 0; i < 40; i++) { if (doraNext(prev) === t) break; prev = (prev + 1) % 34; }
    for (let i = 0; i < 34; i++) if (doraNext(i) === t) { prev = i; break; }
    this.wall.doraIndicators[idx] = { id: -900 - idx, t: prev, red: false, gold: false, dot: false, sp: null };
    return true;
  }

  // =========================================================================
  // 表示用
  // =========================================================================
  tileInfo(t) {
    if (!t) return null;
    return {
      id: t.id, t: t.t, code: typeToCode(t.t), name: tileName(t),
      red: t.red, gold: t.gold, blue: t.blue, star: t.star, rainbow: t.rainbow,
      dot: t.dot, sp: t.sp, flower: t.flower || null,
      // 牌の裏の色。2セットを混ぜるルール（清一色ゲーム）で背一色を狙うには、
      // 自分の手牌の裏が何色かが見えている必要がある
      back: t.back || null,
    };
  }

  /**
   * 表示用：自分の待ち牌と「まだ見えていない残り枚数」
   * 初心者が「あと何が来れば和了か」を掴めるようにするための情報。
   */
  viewerWaits(seat) {
    const p = this.players[seat];
    if (!p || !p.hand || !this.wall) return null;
    // 13枚形（ツモ前）のときだけ出す
    if (p.hand.length % 3 !== 1) return null;
    const counts = countsFromTiles(p.hand);
    if (shantenWithWild(counts, p.melds.length, this.wild, this.handOpts) !== 0) return null;
    return this.waitDetail(waitsWithWild(counts, p.melds.length, this.wild, this.handOpts), counts);
  }

  /** 表示用：指定の牌を切ったらどんな待ちになるか（切る前に確認できるようにする） */
  waitsAfterDiscard(seat, tileId) {
    const p = this.players[seat];
    if (!p || !p.hand) return null;
    const rest = p.hand.filter((t) => t.id !== tileId);
    if (rest.length === p.hand.length) return null;
    const counts = countsFromTiles(rest);
    if (shantenWithWild(counts, p.melds.length, this.wild, this.handOpts) !== 0) return null;
    return this.waitDetail(waitsWithWild(counts, p.melds.length, this.wild, this.handOpts), counts);
  }

  /** 待ち牌に「まだ見えていない枚数」を添える */
  waitDetail(list, myCounts) {
    if (!list || !list.length) return null;
    return list.map((t) => {
      let seen = myCounts[t] || 0;
      for (const q of this.players) {
        for (const d of q.discards) if (d.t === t) seen++;
        for (const m of q.melds) for (const x of m.tiles) if (x.t === t) seen++;
      }
      for (const ind of this.wall.doraIndicators) if (ind.t === t) seen++;
      return { t, code: typeToCode(t), name: typeName(t), left: Math.max(0, 4 - seen) };
    });
  }

  /**
   * デバッグ：手牌を指定の形に近づける（山と交換するので牌の総数は保存される）
   * 見せたい局面をデモで確実に作るための機能。
   * @returns {number} 実際に差し替えられた枚数
   */
  debugSetHand(seat, codes) {
    const p = this.players[seat];
    const w = this.wall;
    if (!p || !w) return 0;
    const want = [];
    for (const c of codes) {
      try { want.push(codeToType(c)); } catch { /* 無効な指定は無視 */ }
    }
    let swapped = 0;
    for (let i = 0; i < want.length && i < p.hand.length; i++) {
      if (p.hand[i].t === want[i]) { swapped++; continue; }
      let found = -1;
      for (let j = w.drawIndex; j < w.liveEnd; j++) if (w.live[j].t === want[i]) { found = j; break; }
      if (found < 0) continue;
      const tmp = p.hand[i];
      p.hand[i] = w.live[found];
      w.live[found] = tmp;
      swapped++;
    }
    p.hand = sortTiles(p.hand);
    return swapped;
  }

  /**
   * デバッグ：山にある牌だけを使って確実にテンパイ形を作る
   * （刻子3つ＋対子2つ＝シャンポン待ち。牌は山と交換するので総数は保存される）
   */
  debugMakeTenpai(seat) {
    const p = this.players[seat];
    const w = this.wall;
    if (!p || !w || p.melds.length) return false;
    // 山に残っている枚数を数える
    const avail = new Map();
    for (let i = w.drawIndex; i < w.liveEnd; i++) {
      const t = w.live[i].t;
      if (t >= NUM_TYPES) continue;
      avail.set(t, (avail.get(t) || 0) + 1);
    }
    const triples = [...avail.entries()].filter(([, n]) => n >= 3).map(([t]) => t);
    const pairs = [...avail.entries()].filter(([, n]) => n >= 2).map(([t]) => t);
    const want = [];
    for (const t of triples.slice(0, 3)) want.push(t, t, t);
    for (const t of pairs.filter((t) => !want.includes(t)).slice(0, 2)) want.push(t, t);
    if (want.length < 13) return false;

    for (let i = 0; i < 13; i++) {
      if (p.hand[i].t === want[i]) continue;
      let found = -1;
      for (let j = w.drawIndex; j < w.liveEnd; j++) if (w.live[j].t === want[i]) { found = j; break; }
      if (found < 0) return false;
      const tmp = p.hand[i];
      p.hand[i] = w.live[found];
      w.live[found] = tmp;
    }
    p.hand = sortTiles(p.hand);
    // 14枚形で向聴0＝どれかを切ればテンパイ
    return shantenWithWild(countsFromTiles(p.hand), 0, this.wild, this.handOpts) === 0;
  }

  snapshot(viewerSeat = 0) {
    const reveal = this.debug.showCpuHands || this.finished;
    return {
      rules: { name: this.rules.meta.name, players: this.n, bonusLabel: this.rules.bonus.label },
      round: { ...this.round, windName: WINDS[this.round.wind] },
      wallRemaining: this.wall ? this.wall.remaining : 0,
      // ゲージの分母。局の最初に引ける枚数（王牌を除いた山）
      wallTotal: this.wallAtStart || (this.wall ? this.wall.remaining : 0),
      dora: this.wall ? this.wall.doraIndicators.map((t) => this.tileInfo(t)) : [],
      ura: this.finished && this.wall ? this.wall.uraIndicators.map((t) => this.tileInfo(t)) : [],
      wareme: this.wareme,
      // 初心者向けの補助情報（雀魂のように、手牌のドラと待ち牌が分かるようにする）
      doraTypes: this.wall ? this.doraTypes() : [],
      waits: this.viewerWaits(viewerSeat),
      turn: this.turn,
      phase: this.phase,
      finished: this.finished,
      result: this.result,
      kyokuEnd: this.kyokuEnd,
      players: this.players.map((p) => ({
        seat: p.seat,
        name: p.name,
        isCpu: p.isCpu,
        points: p.points,
        bonus: p.bonus,
        riichi: p.riichi,
        openRiichi: p.openRiichi,
        wind: WINDS[(p.seat - this.round.dealer + this.n) % this.n],
        isDealer: p.seat === this.round.dealer,
        hand: (p.seat === viewerSeat || reveal
          || (p.openRiichi && p.riichi && this.rules.local.openRiichi.revealMode !== 'waits'))
          ? p.hand.map((t) => this.tileInfo(t))
          : p.hand.map(() => ({ hidden: true })),
        handCount: p.hand.length,
        mighty: this.wild,
        riichiTileId: p.riichiTileId || null,
        drawn: p.drawn && (p.seat === viewerSeat || reveal) ? this.tileInfo(p.drawn) : (p.drawn ? { hidden: true } : null),
        melds: p.melds.map((m) => ({ kind: m.kind, concealed: m.concealed, tiles: m.tiles.map((t) => this.tileInfo(t)) })),
        discards: p.discards.map((t) => this.tileInfo(t)),
        kita: p.kita.map((t) => this.tileInfo(t)),
        kitaCount: p.kita.length,
        flowers: p.flowers.map((t) => this.tileInfo(t)),
        shanten: (p.seat === viewerSeat || reveal) ? shantenWithWild(countsFromTiles(p.hand), p.melds.length, this.wild, this.handOpts) : null,
      })),
    };
  }
}

export { WINDS };
