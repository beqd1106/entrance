/**
 * game.js - 対局画面
 * エンジンを1手ずつ進めながら描画する。人間の入力が必要になった時点で止まる。
 */
import { GameEngine } from '../../src/core/engine.js';
import { decide } from '../../src/core/ai.js';
import { resolveRules, deepMerge } from '../../src/rules/defaults.js';
import { lookupPreset } from './custom.js';
import { STORES } from '../../src/data/stores.js';
import { codeToType, typeName } from '../../src/core/tiles.js';
import { h, clear, tileEl, tileRow, fmt, signed, icon, chip } from './ui.js';

const SPEEDS = [{ label: 'ゆっくり', v: 620 }, { label: '標準', v: 330 }, { label: '速い', v: 120 }];

let G = null;

/** 端末に残す表示設定（localStorageが使えない環境でも動く） */
function loadPref(key, fallback) {
  try {
    const v = localStorage.getItem(`houserule.pref.${key}`);
    return v === null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
function savePref(key, value) {
  try { localStorage.setItem(`houserule.pref.${key}`, JSON.stringify(value)); } catch { /* 保存できなくても続行 */ }
}

export function renderGame(root, params) {
  const presetId = params.preset || 'standard4';
  const preset = lookupPreset(presetId);
  const store = STORES.find((s) => s.presetId === presetId);
  // イベント卓：店舗ルールを部分的に上書きして卓を作る
  const baseRules = resolveRules(preset.rules);
  const event = (baseRules.events || []).find((e) => e.id === params.event && e.enabled !== false) || null;
  const rules = event
    ? resolveRules(deepMerge(preset.rules, event.ruleOverrides || {}))
    : baseRules;

  G = {
    presetId, preset, store, rules, event,
    engine: null, waiting: null, mode: 'idle', riichiIds: null, riichiOpen: false,
    speed: 330, timer: null, log: [], debugOpen: false,
    confirmDiscard: loadPref('confirmDiscard', true),
    selectedTileId: null,
    debug: { showCpuHands: false, forceAlice: false, forceDice: false },
    seed: Date.now() % 100000,
  };
  buildDom(root);
  startGame();
  return () => {
    if (G && G.timer) clearTimeout(G.timer);
    closeOverlay();
    G = null;
  };
}

// ---------------------------------------------------------------------------
function buildDom(root) {
  clear(root);
  G.dom = {};
  G.dom.top = h('div.table-top');
  G.dom.board = h('div.board');
  G.dom.myArea = h('div.my-area');
  G.dom.actions = h('div.actions');
  G.dom.hint = h('div.hint');
  G.dom.hand = h('div.hand-row', { style: { justifyContent: 'center', minHeight: '52px' } });
  G.dom.logbox = h('div.logbox');
  G.dom.ruleCard = h('div.side-card.rule-summary');
  G.dom.debug = h('div.debug-panel.hide');
  G.dom.rotate = h('div.rotate-hint',
    h('span', { html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="3"/><path d="M9 19h6"/></svg>' }),
    h('span', { text: '横向きにすると卓が広く使えます' }));
  const shell = h('div.table-shell',
    G.dom.top,
    G.dom.rotate,
    h('div.table-main',
      h('div.board-scroll', G.dom.board, G.dom.myArea),
      h('div.side-panel', G.dom.ruleCard, G.dom.logbox)),
    h('div.bottom-bar', G.dom.actions, G.dom.hint, G.dom.hand, G.dom.debug));
  root.appendChild(shell);
  G.dom.overlay = null;
  buildDebugPanel();
}

function startGame() {
  const players = [{ name: 'あなた', isCpu: false }];
  for (let i = 1; i < G.rules.game.players; i++) {
    players.push({ name: `CPU${i}`, isCpu: true, level: ['normal', 'expert', 'normal'][i - 1] || 'normal' });
  }
  G.engine = new GameEngine({ rules: G.rules, seed: G.seed, players, debug: { ...G.debug } });
  G.log = [];
  G.engine.startKyoku();
  pushLog('sys', `${G.preset.name} で対局開始（シード ${G.seed}）`);
  drainLog();
  draw();
  loop();
}

function loop() {
  if (!G || !G.engine) return;
  if (G.timer) clearTimeout(G.timer);
  const e = G.engine;
  if (e.finished) { drainLog(); draw(); showFinal(); return; }
  if (e.phase === 'kyokuEnd') { drainLog(); draw(); showKyokuResult(); return; }
  const r = e.advance(decide, 1);
  drainLog();
  if (r.waiting) {
    G.waiting = r.waiting;
    draw();
    return;
  }
  G.waiting = null;
  draw();
  G.timer = setTimeout(loop, G.speed);
}

function act(action) {
  const e = G.engine;
  const seat = G.waiting ? G.waiting.seat : 0;
  G.waiting = null;
  G.mode = 'idle';
  G.riichiIds = null;
  G.selectedTileId = null;
  const r = e.act(seat, action);
  if (r && r.error) { G.dom.hint.textContent = r.error; G.waiting = { seat, choices: e.getChoices(seat) }; draw(); return; }
  drainLog();
  draw();
  G.timer = setTimeout(loop, 80);
}

// ---------------------------------------------------------------------------
// ログ
// ---------------------------------------------------------------------------
function pushLog(kind, text) { G.log.push({ kind, text }); if (G.log.length > 300) G.log.shift(); }

function drainLog() {
  const events = G.engine.drainEvents();
  const nameOf = (s) => G.engine.players[s].name;
  for (const ev of events) {
    switch (ev.type) {
      case 'kyokuStart':
        pushLog('sys', `── ${['東', '南', '西', '北'][ev.wind]}${ev.kyoku}局 ${ev.honba}本場（親：${nameOf(ev.dealer)}）`);
        break;
      case 'discard': pushLog('', `${nameOf(ev.seat)}：${ev.tile.name} 切り${ev.riichi ? '（リーチ宣言牌）' : ''}`); break;
      case 'riichi': pushLog('win', `${nameOf(ev.seat)}：${ev.open ? 'オープンリーチ' : 'リーチ'}${ev.double ? '（ダブル）' : ''}`); break;
      case 'call': pushLog('', `${nameOf(ev.seat)}：${{ pon: 'ポン', chi: 'チー', kan: 'カン' }[ev.kind] || ev.kind}（${nameOf(ev.from)}の${ev.tile.name}）`); break;
      case 'kan': pushLog('', `${nameOf(ev.seat)}：${{ ankan: '暗槓', kakan: '加槓' }[ev.kind] || 'カン'} ${typeName(ev.t)}`); break;
      case 'kanDora': pushLog('rule', `槓ドラ表示：${ev.tile.name}`); break;
      case 'kita': pushLog('rule', `${nameOf(ev.seat)}：${ev.tile.name}を抜く（${ev.count}枚目）`); break;
      case 'flower':
        pushLog('rule', `${nameOf(ev.seat)}：華牌「${ev.label}」を抜く${ev.messages && ev.messages.length ? ' → ' + ev.messages.join(' / ') : ''}`);
        break;
      case 'wareme': pushLog('rule', `割れ目：${nameOf(ev.seat)}（サイコロ ${ev.dice}）`); break;
      case 'abort': pushLog('sys', `途中流局：${ev.reason}`); break;
      case 'kyokuEnd': {
        const res = ev.result;
        if (res.kind === 'win') {
          for (const d of res.details) {
            pushLog('win', `${nameOf(d.seat)}：${d.tsumo ? 'ツモ' : 'ロン'} ${d.yakuman ? `役満` : `${d.han}翻${G.rules.scoring.useFu ? `${d.fu}符` : ''}`}${d.limitName ? `（${d.limitName}）` : ''}`);
            if (d.bonusDetail.length) pushLog('rule', `　${d.bonusDetail.join(' / ')}`);
          }
        } else if (res.kind === 'draw') {
          pushLog('sys', `${res.reason}（テンパイ：${res.tenpai.map(nameOf).join('・') || 'なし'}）`);
        }
        break;
      }
      default: break;
    }
  }
  renderLog();
}

function renderLog() {
  const box = G.dom.logbox;
  clear(box);
  for (const l of G.log.slice(-60)) {
    box.appendChild(h(`div.l-${l.kind || 'x'}`, { text: l.text }));
  }
  box.scrollTop = box.scrollHeight;
}

// ---------------------------------------------------------------------------
// 描画
// ---------------------------------------------------------------------------
function draw() {
  const e = G.engine;
  e.debug.showCpuHands = G.debug.showCpuHands;
  e.debug.forceAlice = G.debug.forceAlice;
  e.debug.forceDice = G.debug.forceDice;
  const s = e.snapshot(0);
  drawTop(s);
  drawBoard(s);
  drawMy(s);
  drawActions(s);
  drawRuleCard(s);
}

/** 対局中もこの店のルールが見えるようにしておく（初来店の不安を消すのが本題） */
function drawRuleCard(s) {
  const box = clear(G.dom.ruleCard);
  const R = G.rules;
  box.appendChild(h('h4', { text: 'このお店のルール' }));
  if (G.event) {
    box.appendChild(h('div.rule-item',
      h('span', { text: 'イベント' }),
      h('span', { text: `${G.event.name}（${G.event.note || '特別ルール'}）` })));
  }
  const item = (k, v) => h('div.rule-item', h('span', { text: k }), h('span', { text: v }));
  const reds = Object.values(R.dora.red || {}).reduce((a, b) => a + b, 0);
  if (R.scoring.mode === 'flat') {
    box.appendChild(item('点数', `東天紅系（${R.scoring.flat.fuFixed}符固定・ロン1人分/ツモ2人分）`));
  } else {
    box.appendChild(item('持ち/返し', `${fmt(R.scoring.startingPoints)} / ${fmt(R.scoring.returnPoints)}`));
  }
  box.appendChild(item('形式', `${R.game.players === 3 ? '三麻' : '四麻'}・${{ east: '東風戦', east_south: '半荘戦', ikkyoku: '一局清算' }[R.game.length]}`));
  box.appendChild(item('ドラ', `表${R.dora.indicators}枚${reds ? ` / 赤${reds}枚` : ''}${R.dora.ura ? ' / 裏あり' : ' / 裏なし'}`));
  const specials = [];
  if (R.local.shiroPocchi.enabled) specials.push('白ポッチ');
  if (R.local.alice.enabled) specials.push('アリス');
  if (R.local.tulip.enabled) specials.push('チューリップ');
  if (R.local.openRiichi.enabled) specials.push('オープンリーチ');
  if (R.local.wareme.enabled) specials.push('割れ目');
  if (R.flowers.enabled) specials.push('華牌');
  if (R.local.dice.enabled) specials.push('サイコロチャンス');
  if (R.game.players === 3 && R.sanma.northMode === 'nuki') {
    const extra = (R.sanma.extraNukiTiles || []).map((c) => typeName(codeToType(c)));
    specials.push(extra.length ? `抜きドラ（北・${extra.join('・')}）` : '北抜き');
  }
  for (const d of R.specialTiles || []) specials.push(d.name);
  box.appendChild(item('特殊', specials.length ? specials.join('・') : 'なし'));
  box.appendChild(item('喰いタン', R.win.kuitan ? 'あり' : 'なし'));
  if (G.store) {
    box.appendChild(h('a.chip.chip-btn', {
      href: `#/store/${G.store.id}`, style: { marginTop: '8px' }, text: '店舗ページを見る',
    }));
  }
}

function drawTop(s) {
  const top = clear(G.dom.top);
  const item = (k, v) => h('div', h('div.k', { text: k }), h('div.v', { text: v }));
  top.appendChild(h('a.chip.chip-btn', { href: '#/stores', text: '← 店舗一覧' }));
  top.appendChild(item('ルール', G.preset.name));
  if (G.event) top.appendChild(h('span.chip.chip-brass', { text: `イベント卓：${G.event.name}` }));
  top.appendChild(item('場', `${s.round.windName}${s.round.kyoku}局 ${s.round.honba}本場`));
  top.appendChild(item('残り', String(s.wallRemaining)));
  top.appendChild(h('div',
    h('div.k', { text: '供託' }),
    h('div.row.gap-4', { style: { height: '22px' } },
      s.round.kyotaku ? Array.from({ length: s.round.kyotaku }, () => h('div.stick')) : h('div.v', { text: '0' }))));
  const dora = h('div.dora-box');
  dora.appendChild(h('div.k', { text: 'ドラ' }));
  s.dora.forEach((d) => dora.appendChild(tileEl(d, { size: 'sm' })));
  top.appendChild(dora);
  top.appendChild(h('div.grow'));
  const sp = h('div.row.gap-4');
  SPEEDS.forEach((x) => {
    const b = h('button.act', { text: x.label, style: { padding: '4px 10px', fontSize: '11px', fontWeight: '500' } });
    if (x.v === G.speed) b.style.background = 'rgba(240,227,200,.28)';
    b.addEventListener('click', () => { G.speed = x.v; draw(); });
    sp.appendChild(b);
  });
  top.appendChild(sp);
  const conf = h('button.act', {
    text: G.confirmDiscard ? '2度押しで確定：ON' : '2度押しで確定：OFF',
    title: '打牌の押し間違いを防ぎます',
    style: { padding: '4px 10px', fontSize: '11px', fontWeight: '500' },
  });
  if (G.confirmDiscard) conf.style.background = 'rgba(16,185,129,.28)';
  conf.addEventListener('click', () => {
    G.confirmDiscard = !G.confirmDiscard;
    G.selectedTileId = null;
    savePref('confirmDiscard', G.confirmDiscard);
    draw();
  });
  top.appendChild(conf);
  const dbg = h('button.act', { style: { padding: '4px 10px', fontSize: '11px', fontWeight: '500' } }, icon('bug', 13), 'デバッグ');
  dbg.addEventListener('click', () => {
    G.debugOpen = !G.debugOpen;
    G.dom.debug.classList.toggle('hide', !G.debugOpen);
  });
  top.appendChild(dbg);
}

function seatPos(n, seat) {
  if (n === 4) return ['bottom', 'right', 'top', 'left'][seat];
  return ['bottom', 'right', 'left'][seat];
}

function drawBoard(s) {
  const board = clear(G.dom.board);
  const n = s.players.length;
  for (const p of s.players) {
    const pos = seatPos(n, p.seat);
    if (pos === 'bottom') continue;
    board.appendChild(seatEl(p, s, `seat-${pos}`));
  }
  // 中央
  const center = h('div.board-center',
    h('div.center-info',
      h('div.center-kyoku', { text: `${s.round.windName}${s.round.kyoku}局` }),
      h('div.center-sub', { text: `${s.round.honba}本場 ／ 残り ${s.wallRemaining}枚` }),
      h('div.dora-box', s.dora.map((d) => tileEl(d, { size: 'sm' }))),
      s.wareme != null ? h('div.center-sub', { text: `割れ目：${s.players[s.wareme].name}` }) : null,
      G.rules.bonus.enabled ? h('div.center-sub', { text: G.rules.bonus.label }) : null));
  board.appendChild(center);
  // 自分の捨て牌・副露はbottomエリアへ
  const me = s.players[0];
  board.appendChild(h('div.seat.seat-bottom', { class: me.riichi ? 'riichi' : '' },
    seatHead(me, s),
    meldsEl(me),
    discardsEl(me)));
}

function seatHead(p, s) {
  const isTurn = s.turn === p.seat && !s.finished && s.phase !== 'kyokuEnd';
  return h('div.seat-head',
    h('div.seat-wind', { class: p.isDealer ? 'dealer' : '', text: p.wind }),
    isTurn ? h('div.turn-dot') : null,
    h('div.grow', { style: { fontSize: '12.5px' } }, p.name),
    p.riichi ? h('span.badge-riichi', { text: p.openRiichi ? 'オープン' : 'リーチ' }) : null,
    s.wareme === p.seat ? h('span.badge-wareme', { text: '割れ目' }) : null,
    h('div.seat-pts', { text: fmt(p.points) }),
    G.rules.bonus.enabled ? h('div.seat-bp', { text: `${signed(p.bonus)}BP` }) : null);
}

/** 抜いた牌を種類ごとにまとめて表示（北・ガリ・華牌を混同させない） */
function nukiGroup(tiles, label) {
  if (!tiles || !tiles.length) return null;
  const byCode = new Map();
  for (const t of tiles) {
    const k = `${t.code}|${t.red}|${t.gold}`;
    if (!byCode.has(k)) byCode.set(k, { tile: t, n: 0 });
    byCode.get(k).n += 1;
  }
  return h('div.meld.nuki',
    h('span.nuki-label', { text: label }),
    [...byCode.values()].map(({ tile, n }) => h('div.nuki-item',
      tileEl(tile, { size: 'sm' }),
      n > 1 ? h('span.nuki-count', { text: `×${n}` }) : null)));
}

function meldsEl(p) {
  const kita = p.kita || [];
  if (!p.melds.length && !kita.length && !p.flowers.length) return null;
  const wrap = h('div.melds');
  for (const m of p.melds) {
    wrap.appendChild(h('div.meld', m.tiles.map((t) => tileEl(m.kind === 'kan' && m.concealed ? { hidden: true } : t, { size: 'sm' }))));
  }
  // 抜きドラ（北・ガリ）と華牌は別グループにする
  const k = nukiGroup(kita, '抜き');
  if (k) wrap.appendChild(k);
  const f = nukiGroup(p.flowers, '華');
  if (f) wrap.appendChild(f);
  return wrap;
}

function discardsEl(p) {
  const lastId = G.engine.lastDiscard ? G.engine.lastDiscard.tile.id : null;
  return h('div.discards', p.discards.map((t) => tileEl(t, {
    size: 'xs',
    attrs: t.id === lastId ? { class: 'just' } : null,
  })));
}

function seatEl(p, s, cls) {
  const active = s.turn === p.seat && !s.finished;
  const el = h(`div.seat.${cls}`, { class: `${active ? 'active' : ''} ${p.riichi ? 'riichi' : ''}` },
    seatHead(p, s),
    h('div.hand-row', p.hand.map((t) => tileEl(t, { size: 'xs' }))),
    meldsEl(p),
    discardsEl(p));
  return el;
}

function drawMy(s) {
  const me = s.players[0];
  clear(G.dom.myArea);
  const hand = clear(G.dom.hand);
  const choices = G.waiting ? G.waiting.choices : [];
  const discard = choices.find((c) => c.type === 'discard');
  const selectable = G.mode === 'riichiSelect' ? G.riichiIds : (discard ? discard.tileIds : null);

  // 同種牌は代表1枚しか選択肢に含まれないため、見た目が同じ牌はすべて押せるようにする
  const keyOf = (t) => `${t.t}|${t.red}|${t.gold}|${t.dot}|${t.sp}`;
  const pickable = new Map();
  if (selectable) {
    for (const id of selectable) {
      const t = me.hand.find((x) => x.id === id);
      if (t && !pickable.has(keyOf(t))) pickable.set(keyOf(t), id);
    }
  }
  // 自分の向聴数（初心者が「今どこまで来ているか」を掴めるように）
  const tag = me.shanten === null ? null
    : me.shanten < 0 ? { text: '和了', cls: 'tenpai' }
      : me.shanten === 0 ? { text: 'テンパイ', cls: 'tenpai' }
        : { text: `${me.shanten}向聴`, cls: '' };
  if (tag) {
    G.dom.myArea.appendChild(h('div.row.center', { style: { marginTop: '6px' } },
      h('div.shanten-tag', { class: tag.cls, text: tag.text })));
  }

  const drawnId = me.drawn && !me.drawn.hidden ? me.drawn.id : null;
  const tiles = me.hand.filter((t) => t.id !== drawnId);
  const render = (t, gap) => {
    const id = pickable.get(keyOf(t));
    const can = id !== undefined;
    return tileEl(t, {
      size: 'lg',
      gap,
      clickable: can,
      selected: G.confirmDiscard && G.selectedTileId === id,
      dim: !!selectable && !can,
      onClick: can ? () => onTileClick({ ...t, id }) : null,
    });
  };
  tiles.forEach((t) => hand.appendChild(render(t, false)));
  if (drawnId) hand.appendChild(render(me.drawn, true));
}

function onTileClick(t) {
  if (G.mode === 'riichiSelect') { act({ type: 'riichi', tileId: t.id, open: G.riichiOpen }); return; }
  // 押し間違い防止：1度目のタップで選択、同じ牌をもう一度タップで確定
  if (!G.confirmDiscard) { act({ type: 'discard', tileId: t.id }); return; }
  if (G.selectedTileId === t.id) {
    G.selectedTileId = null;
    act({ type: 'discard', tileId: t.id });
    return;
  }
  G.selectedTileId = t.id;
  draw();
}

function drawActions(s) {
  const box = clear(G.dom.actions);
  const hint = G.dom.hint;
  const choices = G.waiting ? G.waiting.choices : [];
  if (!choices.length) {
    hint.textContent = s.finished ? '' : (s.phase === 'kyokuEnd' ? '' : 'CPUの手番です');
    return;
  }
  if (G.mode === 'riichiSelect') {
    hint.textContent = 'リーチ宣言牌を選んでください';
    const cancel = h('button.act.act-pass', { text: 'やめる' });
    cancel.addEventListener('click', () => { G.mode = 'idle'; G.riichiIds = null; draw(); });
    box.appendChild(cancel);
    return;
  }
  const add = (label, cls, fn) => {
    const b = h(`button.act${cls ? `.${cls}` : ''}`, { text: label });
    b.addEventListener('click', fn);
    box.appendChild(b);
  };
  for (const c of choices) {
    switch (c.type) {
      case 'tsumo': add('ツモ', 'act-win', () => act({ type: 'tsumo' })); break;
      case 'ron': add('ロン', 'act-win', () => act({ type: 'ron' })); break;
      case 'riichi':
        add(c.open ? 'オープンリーチ' : 'リーチ', 'act-riichi', () => {
          G.mode = 'riichiSelect'; G.riichiIds = c.tileIds; G.riichiOpen = !!c.open; draw();
        });
        break;
      case 'pon': add(c.label, 'act-call', () => act({ type: 'pon', tileIds: c.tileIds })); break;
      case 'chi': add(c.label, 'act-call', () => act({ type: 'chi', tileIds: c.tileIds })); break;
      case 'kan': add(c.label, 'act-call', () => act({ type: 'kan', kind: c.kind, t: c.t })); break;
      case 'kita': add(c.label || '北抜き', 'act-nuki', () => act({ type: 'kita', t: c.t })); break;
      case 'kyuushu': add('九種九牌', '', () => act({ type: 'kyuushu' })); break;
      case 'pass': add('スルー', 'act-pass', () => act({ type: 'pass' })); break;
      default: break;
    }
  }
  const hasDiscard = choices.some((c) => c.type === 'discard');
  if (hasDiscard && G.confirmDiscard && G.selectedTileId != null) {
    hint.textContent = 'もう一度タップで確定（他の牌を選び直せます）';
  } else if (hasDiscard) {
    hint.textContent = G.confirmDiscard ? '切る牌をタップ（2回タップで確定）' : '切る牌をタップ';
  } else {
    hint.textContent = '選択してください';
  }
}

// ---------------------------------------------------------------------------
// 結果表示
// ---------------------------------------------------------------------------
function overlay(node) {
  closeOverlay();
  const ov = h('div.overlay', node);
  G.dom.overlay = ov;
  document.body.appendChild(ov);
}
function closeOverlay() {
  if (G.dom.overlay) { G.dom.overlay.remove(); G.dom.overlay = null; }
}

function showKyokuResult() {
  const e = G.engine;
  const res = e.kyokuEnd;
  const nameOf = (i) => e.players[i].name;
  const body = h('div.sheet-body');

  if (res.kind === 'win') {
    for (const d of res.details) {
      body.appendChild(h('div.row.gap-12', { style: { alignItems: 'baseline', marginBottom: '6px' } },
        h('div.big-score', { text: d.yakuman ? (d.yakuman > 1 ? `${d.yakuman}倍役満` : '役満') : (d.limitName || `${d.han}翻${G.rules.scoring.useFu ? ` ${d.fu}符` : ''}`) }),
        h('div.muted', { text: `${nameOf(d.seat)} の ${d.tsumo ? 'ツモ' : 'ロン'}` })));
      const list = h('div.yaku-list');
      for (const y of d.yaku) {
        list.appendChild(h('div.yaku-item', h('span', { text: y.name }), h('span.num', { text: y.yakuman ? '役満' : `${y.han}翻` })));
      }
      const dd = d.doraDetail;
      const extras = [];
      if (dd.dora) extras.push(`ドラ${dd.dora}`);
      if (dd.aka) extras.push(`赤${dd.aka}`);
      if (dd.gold) extras.push(`金${dd.gold}`);
      if (dd.kita) extras.push(`抜きドラ${dd.kita}`);
      if (d.uraCount) extras.push(`裏${d.uraCount}`);
      if (d.extraDora) extras.push(`特殊牌ドラ+${d.extraDora}`);
      if (d.extraHan) extras.push(`特殊牌翻+${d.extraHan}`);
      if (d.rankUp) extras.push(`打点${d.rankUp}ランクアップ`);
      if (extras.length) list.appendChild(h('div.yaku-item', h('span', { text: extras.join(' / ') }), h('span')));
      body.appendChild(list);
      if (d.substituted) {
        body.appendChild(h('div.notice', { text: `${d.substituted.from} をオールマイティとして ${d.substituted.to} の代わりに使用しました。` }));
      }
      if (d.aliceFlips && d.aliceFlips.length) {
        body.appendChild(h('div', { style: { margin: '10px 0' } },
          h('div.label', { text: `${d.aliceFlips[0].label} めくり` }),
          h('div.row.gap-8', d.aliceFlips.map((f) => h('div', { style: { textAlign: 'center' } },
            tileEl(f.tile, { size: 'sm', anim: 'flip' }),
            h('div.tiny', { class: f.matched ? '' : 'muted', text: f.matched ? '一致' : '不一致' }))))));
      }
      if (d.diceRolls && d.diceRolls.length) {
        body.appendChild(h('div', { style: { margin: '10px 0' } },
          h('div.label', { text: 'サイコロチャンス' }),
          h('div.num', { text: d.diceRolls.map((r) => r.join('・')).join(' → ') })));
      }
      if (d.bonusDetail.length) {
        body.appendChild(h('div.tiny.muted', { text: d.bonusDetail.join(' / ') }));
      }
      if (G.rules.bonus.enabled) {
        body.appendChild(h('div.chip.chip-brass', { text: `${G.rules.bonus.label} ${signed(d.bonus)}` }));
      }
      body.appendChild(h('div.rule-line'));
    }
  } else {
    body.appendChild(h('div.big-score', { text: res.reason || '流局' }));
    if (res.kind === 'draw') {
      body.appendChild(h('div.muted', { text: `テンパイ：${res.tenpai.map(nameOf).join('・') || 'なし'}` }));
    }
    body.appendChild(h('div.rule-line'));
  }

  const table = h('div.kv');
  e.players.forEach((p, i) => {
    const d = res.deltas[i] || 0;
    table.appendChild(h('dt', { text: p.name }));
    table.appendChild(h('dd', h('span', { class: d >= 0 ? 'pt-plus' : 'pt-minus', text: signed(d) }),
      h('span.muted.tiny', { text: ` → ${fmt(p.points)}点` })));
  });
  body.appendChild(table);

  const next = h('button.btn.btn-primary', { text: e.finished ? '結果を見る' : '次の局へ' });
  next.addEventListener('click', () => {
    closeOverlay();
    if (e.finished) { showFinal(); return; }
    e.nextKyoku();
    drainLog();
    draw();
    loop();
  });
  overlay(h('div.sheet',
    h('div.sheet-head', h('div.eyebrow', { text: '局終了' }), h('h3', { text: `${['東', '南', '西', '北'][res.wind]}${res.kyoku}局 ${res.honba}本場` })),
    body,
    h('div.sheet-foot', next)));
}

function showFinal() {
  const e = G.engine;
  const r = e.result;
  const body = h('div.sheet-body');
  body.appendChild(h('div.muted', { text: `終了理由：${r.reason} ／ ${r.kyokuCount}局` }));
  const list = h('div.mini-list', { style: { marginTop: '12px' } });
  for (const f of r.finals) {
    list.appendChild(h('div.mini-item',
      h('div.seat-wind', { text: String(f.rank) }),
      h('div.grow', h('div', { text: f.name }), h('div.tiny.muted', { text: `${fmt(f.points)}点` })),
      h('div', { style: { textAlign: 'right' } },
        h('div.num', { text: `${f.total > 0 ? '+' : ''}${f.total}` }),
        G.rules.bonus.enabled ? h('div.tiny', { class: 'muted', text: `${signed(f.bonus)}BP` }) : null)));
  }
  body.appendChild(list);
  if (G.rules.bonus.enabled) {
    body.appendChild(h('div.notice', { style: { marginTop: '14px' }, text: 'BPはゲーム内専用の非換金ポイントです。現金・景品との交換はありません。' }));
  }

  const again = h('button.btn.btn-primary', { text: 'もう一度遊ぶ' });
  again.addEventListener('click', () => { closeOverlay(); G.seed = (G.seed + 7919) % 100000; startGame(); });
  const back = h('a.btn.btn-ghost', { href: G.store ? `#/store/${G.store.id}` : '#/stores', text: G.store ? '店舗ページへ戻る' : '店舗一覧へ' });
  back.addEventListener('click', () => closeOverlay());
  overlay(h('div.sheet',
    h('div.sheet-head', h('div.eyebrow', { text: '対局終了' }), h('h3', { text: G.preset.name })),
    body,
    h('div.sheet-foot', back, again)));
}

// ---------------------------------------------------------------------------
// デバッグパネル
// ---------------------------------------------------------------------------
function buildDebugPanel() {
  const d = clear(G.dom.debug);
  d.appendChild(h('h4', { text: 'デバッグモード（特殊ルール検証用）' }));
  const grid = h('div.debug-grid');
  const toggle = (label, key) => {
    const b = h('button.act', { text: `${label}：${G.debug[key] ? 'ON' : 'OFF'}` });
    b.addEventListener('click', () => {
      G.debug[key] = !G.debug[key];
      buildDebugPanel();
      draw();
    });
    return b;
  };
  grid.appendChild(toggle('CPU手牌を表示', 'showCpuHands'));
  grid.appendChild(toggle('アリスを強制成立', 'forceAlice'));
  grid.appendChild(toggle('サイコロを強制発動', 'forceDice'));

  const btn = (label, fn) => {
    const b = h('button.act', { text: label });
    b.addEventListener('click', () => { fn(); drainLog(); draw(); });
    return b;
  };
  grid.appendChild(btn('次ツモ：白ポッチ', () => {
    const ok = G.engine.debugForceNextDraw((t) => t.dot);
    pushLog('rule', ok ? '［デバッグ］次のツモを白ポッチに設定' : '［デバッグ］白ポッチが山にありません');
  }));
  grid.appendChild(btn('次ツモ：特殊牌', () => {
    const ok = G.engine.debugForceNextDraw((t) => !!t.sp);
    pushLog('rule', ok ? '［デバッグ］次のツモを特殊牌に設定' : '［デバッグ］特殊牌が山にありません');
  }));
  for (const [label, code] of [['春', '1f'], ['夏', '2f'], ['秋', '3f'], ['冬', '4f']]) {
    grid.appendChild(btn(`次ツモ：${label}`, () => {
      const t = codeToType(code);
      const ok = G.engine.debugForceNextDraw((x) => x.t === t);
      pushLog('rule', ok ? `［デバッグ］次のツモを華牌「${label}」に設定` : `［デバッグ］華牌「${label}」が山にありません`);
    }));
  }
  grid.appendChild(btn('手牌に特殊牌を入れる', () => {
    const ok = G.engine.debugInjectToHand(0, (t) => !!t.sp || t.dot || t.gold);
    pushLog('rule', ok ? '［デバッグ］手牌に特殊牌／金牌／白ポッチを差し込み' : '［デバッグ］該当する牌がありません');
  }));
  grid.appendChild(btn('自分を50000点に', () => {
    G.engine.debugSetPoints([50000]);
    pushLog('rule', '［デバッグ］点数を変更');
  }));
  grid.appendChild(btn('自分を1000点に', () => {
    G.engine.debugSetPoints([1000]);
    pushLog('rule', '［デバッグ］点数を変更');
  }));
  grid.appendChild(btn('この局をやり直す', () => {
    G.seed = (G.seed + 101) % 100000;
    closeOverlay();
    startGame();
  }));
  d.appendChild(grid);

  const codeIn = h('input', { type: 'text', placeholder: '牌コード（例 5z / 0m / 3s）', style: { maxWidth: '180px' } });
  const go = h('button.act', { text: '次ツモに設定' });
  go.addEventListener('click', () => {
    try {
      const t = codeToType(codeIn.value.trim());
      const ok = G.engine.debugForceNextDraw((x) => x.t === t);
      pushLog('rule', ok ? `［デバッグ］次のツモを ${typeName(t)} に設定` : '［デバッグ］その牌は山にありません');
      drainLog();
    } catch { pushLog('rule', '［デバッグ］牌コードが不正です'); renderLog(); }
  });
  d.appendChild(h('div.row.gap-8', { style: { marginTop: '10px' } }, codeIn, go,
    h('div.tiny.muted', { text: 'm=萬 p=筒 s=索 z=字（5z=白） f=華牌（1f=春）' })));
}
