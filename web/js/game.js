/**
 * game.js - 対局画面
 * エンジンを1手ずつ進めながら描画する。人間の入力が必要になった時点で止まる。
 */
import { GameEngine } from '../../src/core/engine.js';
import { decide } from '../../src/core/ai.js';
import { resolveRules, deepMerge } from '../../src/rules/defaults.js';
import { lookupPreset } from './custom.js';
import { recordPlay } from './dashboard.js';
import { rememberTable } from './recent.js';
import { STORES } from '../../src/data/stores.js';
import { codeToType, typeName, tileFaceKey } from '../../src/core/tiles.js';
import { LOCAL_YAKU_DEFS } from '../../src/core/yaku.js';
import { h, clear, tileEl, tileRow, fmt, signed, icon, chip, ruleChip } from './ui.js';
import { currentTable, clearTable } from './online.js';
import { sendAct, resync, leaveRoom, onMessage, disconnect, connect, status as netStatus } from './net.js';

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
  // オンライン卓は、部屋を作った人のルールをそのまま使う。
  // 自作ルールは相手の端末には無いので、部屋が持ってきた中身を優先する。
  const table = params.room ? currentTable() : null;
  const online = table && table.no === params.room ? table : null;
  const preset = online && online.rulesPatch
    ? { id: presetId, name: (online.rulesPatch.meta && online.rulesPatch.meta.name) || 'オンライン卓', rules: online.rulesPatch }
    : lookupPreset(presetId);
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
    autoTsumogiri: loadPref('autoTsumogiri', true),
    // 卓を広く使うため、右の欄（ルールと履歴）は既定で畳んでおく
    sideOpen: loadPref('sideOpen', false),
    selectedTileId: null,
    // 自分がどの席か。ひとりで打つときは常に0。オンラインでは配られた席が入る。
    // 画面はこの席を下辺に置いて描く（engine の席番号はどの端末でも同じ）。
    mySeat: 0,
    // オンライン対局のときだけ入る。null なら今までどおりひとりで打つ卓。
    online: null,
    // 手番の残り時間（オンラインのときだけ動く）
    clock: null, ticker: null, remoteWait: null, sending: false,
    debugAvailable: params.debug === '1' || loadPref('debugPanel', false),
    debug: { showCpuHands: false, forceAlice: false, forceDice: false },
    seed: Date.now() % 100000,
  };
  // オンライン卓（待合室で開始が決まっている）なら、その席と種を使う
  if (online) {
    G.online = {
      no: online.no, seats: online.seats, host: online.host ?? 0,
      applied: 0, inbox: new Map(), resyncTimer: null, off: null,
    };
    G.mySeat = online.seat || 0;
    G.seed = online.seed;
    clearTable();
  }

  // 部屋番号つきで来たのに卓の情報が無い（再読み込みなど）なら待合室へ戻す
  if (params.room && !G.online) {
    location.hash = '#/online';
    return () => {};
  }
  if (G.online) {
    G.online.off = onMessage((msg) => {
      if (msg.type === '_state') { drawNetState(); return; }
      if (msg.type === 'error') {
        // 断られたときに送信中のままにすると、二度と打てなくなる。
        // 手番に戻して、理由を出す。
        if (G.sending) {
          G.sending = false;
          const seat = G.mySeat;
          const choices = G.engine ? G.engine.getChoices(seat) : [];
          if (choices.length) G.waiting = { seat, choices };
        }
        pushLog('sys', `※ ${msg.message}`);
        drainLog();
        draw();
        return;
      }
      if (msg.type === 'acts') { receiveActs(msg.acts || []); return; }
      if (msg.type === 'room' && G && G.online) {
        // 誰かが落ちた・戻ったときの表示だけ更新する
        G.online.seats = msg.room.seats;
        if (G.engine) draw();
      }
    });
  }

  // ホームの「前回の続き」から戻れるように、開いた卓を覚えておく
  rememberTable({ presetId, name: preset.name, event: params.event || null });
  // 対局中だけ、横持ちでナビを隠して卓を最大化する（他の画面では隠さない）
  document.body.classList.add('playing');
  buildDom(root);
  // 途中から戻った卓は、案内を挟まずにそのまま追いつく
  if (G.online && online.rejoin) {
    startGame();
    resync(G.online.no, 0);
  } else {
    showPregame();
  }
  return () => {
    if (G && G.timer) clearTimeout(G.timer);
    if (G && G.ticker) clearInterval(G.ticker);
    if (G && G.online) {
      if (G.online.off) G.online.off();
      if (G.online.resyncTimer) clearTimeout(G.online.resyncTimer);
      leaveRoom(G.online.no);
      disconnect();
    }
    closeOverlay();
    closeTileInfo();
    document.body.classList.remove('playing');
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
  // 自分の残り時間。オンラインのときだけ意味を持つ
  G.dom.myClock = h('div.seat-clock.my-clock', h('span.seat-clock-num'), h('i.seat-clock-bar'));
  G.dom.hand = h('div.hand-row', { style: { justifyContent: 'center', minHeight: '52px' } });
  G.dom.logbox = h('div.logbox');
  G.dom.ruleCard = h('div.side-card.rule-summary');
  G.dom.debug = h('div.debug-panel.hide');
  G.dom.toasts = h('div.toasts');
  G.dom.rotate = h('div.rotate-hint',
    h('span', { html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="3"/><path d="M9 19h6"/></svg>' }),
    h('span', { text: '横向きにすると卓が広く使えます' }));
  // 右の欄（ルールと履歴）は、開いている間ずっと卓の横幅を300px奪う。
  // 卓を広く使うほうが打ちやすいので、既定では畳んでおき、
  // 見たいときだけ上の帯のボタンで開く。
  // 向聴の表示は卓の外に浮いていて、卓と手牌のあいだに空きを作っていた。
  // 手元の情報なので、手牌の側へ寄せる
  G.dom.main = h('div.table-main.side-closed',
    h('div.board-scroll', G.dom.board),
    h('div.side-panel', G.dom.ruleCard, G.dom.logbox));
  const shell = h('div.table-shell',
    G.dom.top,
    G.dom.rotate,
    G.dom.main,
    h('div.bottom-bar', G.dom.myArea, G.dom.actions,
      h('div.hint-row', G.dom.hint, G.dom.myClock), G.dom.hand, G.dom.debug),
    G.dom.toasts);
  root.appendChild(shell);
  G.dom.overlay = null;
  buildDebugPanel();
}

// ---------------------------------------------------------------------------
// 対局前の確認（この店で押さえておくべき点だけを出す）
// ---------------------------------------------------------------------------
function pregamePoints() {
  const R = G.rules;
  const pts = [];
  const push = (title, body, tone) => pts.push({ title, body, tone });

  push(R.game.players === 3 ? '三人麻雀' : '四人麻雀',
    `${{ east: '東風戦', east_south: '半荘戦', ikkyoku: '一局清算' }[R.game.length] || R.game.length}`
    + (R.scoring.mode === 'flat' ? '／点数の数え方が特殊です' : `／${fmt(R.scoring.startingPoints)}点持ち${fmt(R.scoring.returnPoints)}点返し`),
    'slate');

  if (R.local.shouhaiMighty && R.local.shouhaiMighty.enabled) {
    const n = R.local.shouhaiMighty.count || 1;
    push('少牌マイティ',
      `手牌が${n}枚少ない代わりに、足りない${n}枚は「何にでもなる牌」として常に持っています。`
      + 'テンパイの形になったら、その時点で和了です。',
      'amber');
  }
  if (R.game.pointCapEnd && R.game.pointCapEnd.enabled) {
    push('点数で打ち切り', `だれかが${fmt(R.game.pointCapEnd.points)}点に達した局で対局が終わります。`, 'slate');
  }
  if (R.local.shiroPocchi.enabled) {
    const cond = { always: 'いつでも', any_tsumo: 'ツモのとき', riichi_tsumo: 'リーチ後のツモのとき' }[R.local.shiroPocchi.almightyCondition];
    push('白ポッチ', `白に赤い点が付いた特別な牌が${R.local.shiroPocchi.count}枚。${cond}、好きな牌の代わりに使えます。`, 'sky');
  }
  if (R.local.alice.enabled) {
    push('アリス', '和了したあとに牌をめくります。手牌と同じ牌が出るとボーナス。当たり続ける限りめくれます。', 'coral');
  }
  if (R.flowers.enabled) {
    push('華牌（春夏秋冬）', '引いたら自動で抜けて、すぐ次の牌を引きます。春夏秋冬それぞれ違う効果があります。', 'amber');
  }
  if (R.game.players === 3 && R.sanma.northMode === 'nuki') {
    const extra = (R.sanma.extraNukiTiles || []).map((c) => typeName(codeToType(c)));
    push('抜きドラ', `北${extra.length ? `と${extra.join('・')}` : ''}は手牌から抜いて使います。抜くとドラが増えます。`, 'teal');
  }
  if (R.local.wareme.enabled) {
    push('割れ目', `サイコロで決まった人は、払うときも受け取るときも${R.local.wareme.multiplier}倍になります。`, 'rose');
  }
  for (const d of (R.specialTiles || []).slice(0, 2)) {
    push(d.name, d.description || 'この店だけの特別な牌です。手牌に入ると効果があります。', 'violet');
  }
  if (R.local.dice.enabled) {
    push('サイコロチャンス', '条件を満たすとサイコロを振れます。出目に応じてボーナスが入ります。', 'amber');
  }
  return pts.slice(0, 5);
}

function showPregame() {
  const R = G.rules;
  const pts = pregamePoints();
  const body = h('div.sheet-body');
  body.appendChild(h('p.muted', { style: { marginTop: '0' }, text: 'このお店で覚えておくとよいのは、次の点だけです。' }));
  const list = h('div.pregame-list');
  for (const p of pts) {
    list.appendChild(h('div.pregame-item',
      h('span', { class: `chip tag-${p.tone}`, text: p.title }),
      h('p', { text: p.body })));
  }
  body.appendChild(list);
  if (R.bonus.enabled) {
    body.appendChild(h('div.notice', { style: { marginTop: '14px' }, text: `ボーナス（BP）は${R.bonus.label}です。お金とは交換できません。` }));
  }
  // 料金の案内（設定してある店だけ。対局そのものには影響しない）
  if (R.fees && R.fees.show) {
    const parts = [];
    if (R.fees.perGame) parts.push(`1半荘 ${R.fees.perGame.toLocaleString('ja-JP')}円`);
    if (R.fees.seat) parts.push(`席料 ${R.fees.seat.toLocaleString('ja-JP')}円／時間`);
    if (R.fees.note) parts.push(R.fees.note);
    if (parts.length) {
      body.appendChild(h('div.notice', { style: { marginTop: '10px' }, text: `来店時の料金の目安：${parts.join(' ／ ')}` }));
    }
  }

  const start = h('button.btn.btn-brass.btn-lg', {}, icon('play', 15), 'この設定で対局を始める');
  start.addEventListener('click', () => { closeOverlay(); startGame(); });
  const back = h('a.btn.btn-ghost', {
    href: G.store ? `#/store/${G.store.id}` : '#/stores', text: 'ルールをもっと見る',
  });
  back.addEventListener('click', () => closeOverlay());

  overlay(h('div.sheet',
    h('div.sheet-head',
      h('div.eyebrow', { text: G.event ? `イベント卓：${G.event.name}` : '対局前の確認' }),
      h('h3', { text: G.preset.name })),
    body,
    h('div.sheet-foot', back, start)));
}

// ---------------------------------------------------------------------------
// 特殊効果のトースト（何が起きたかをその場で伝える。演出は短く）
// ---------------------------------------------------------------------------
function toast(title, body, tone = 'amber') {
  if (!G || !G.dom || !G.dom.toasts) return;
  const el = h('div.toast', { class: `toast-${tone}` },
    h('b', { text: title }),
    body ? h('span', { text: body }) : null);
  G.dom.toasts.appendChild(el);
  setTimeout(() => { el.classList.add('out'); }, 2200);
  setTimeout(() => { el.remove(); }, 2700);
}

// ---------------------------------------------------------------------------
// 牌の説明（長押し・右クリックで出す。「この店ではどういう牌か」を伝える）
// ---------------------------------------------------------------------------
function tileMeaning(info, s) {
  const R = G.rules;
  const lines = [];
  if (info.dot) {
    const p = R.local.shiroPocchi;
    const cond = { always: 'いつでも', any_tsumo: 'ツモのとき', riichi_tsumo: 'リーチ後のツモのとき' }[p.almightyCondition];
    lines.push(p.mode === 'bonus'
      ? `白ポッチ。この店ではボーナス専用です（+${p.bonus}BP）。`
      : `白ポッチ。${cond}、好きな牌の代わりに使えます（+${p.bonus}BP）。`);
  }
  if (info.sp) {
    const def = (R.specialTiles || []).find((d) => d.id === info.sp);
    if (def) lines.push(`${def.name}。${def.description || 'この店だけの特別な牌です。'}`);
  }
  if (info.red) lines.push('赤牌。持っているだけでドラが1枚増えます。');
  if (info.gold) lines.push(`金牌。${R.dora.goldIsDora ? 'ドラとして数えます。' : 'ドラには数えませんが祝儀の対象です。'}`);
  if (info.blue) lines.push('青牌。この店の特別な色の牌です。');
  if (info.flower || info.t >= 34) lines.push('華牌。引くと自動で抜けて、すぐ次の牌を引きます。');
  if ((s.doraTypes || []).includes(info.t)) lines.push('この局のドラです。持っていると打点が上がります。');
  if (info.t === 30 && R.game.players === 3 && R.sanma.northMode === 'nuki') {
    lines.push('北。手牌から抜くと抜きドラになります。');
  }
  if (!lines.length) lines.push('特別な効果のない牌です。');
  return lines;
}

/** 牌の説明をその場に出す（画面を覆わない小さなポップ） */
function showTileInfo(info, s, anchorEl) {
  closeTileInfo();
  const box = h('div.tile-pop',
    h('div.tile-pop-head', tileEl(info, { size: 'sm' }), h('b', { text: info.name })),
    h('div.tile-pop-body', tileMeaning(info, s).map((t) => h('p', { text: t }))));
  document.body.appendChild(box);
  const r = anchorEl.getBoundingClientRect();
  const w = box.offsetWidth;
  box.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  box.style.top = `${Math.max(8, r.top - box.offsetHeight - 10)}px`;
  G.dom.tilePop = box;
  const close = (ev) => { if (!box.contains(ev.target)) closeTileInfo(); };
  setTimeout(() => document.addEventListener('pointerdown', close, { once: true }), 0);
}

function closeTileInfo() {
  if (G && G.dom && G.dom.tilePop) { G.dom.tilePop.remove(); G.dom.tilePop = null; }
}

function startGame() {
  const players = G.online
    ? G.online.seats.map((s, i) => ({
      name: s.name || `CPU${i}`,
      isCpu: !!s.cpu,
      level: ['normal', 'expert', 'normal'][i - 1] || 'normal',
    }))
    : [{ name: 'あなた', isCpu: false }];
  if (!G.online) {
    for (let i = 1; i < G.rules.game.players; i++) {
      players.push({ name: `CPU${i}`, isCpu: true, level: ['normal', 'expert', 'normal'][i - 1] || 'normal' });
    }
  }
  G.engine = new GameEngine({ rules: G.rules, seed: G.seed, players, debug: { ...G.debug } });
  G.log = [];
  G.engine.startKyoku();
  recordPlay(G.presetId);
  pushLog('sys', G.online
    ? `${G.preset.name} で対局開始（部屋 ${G.online.no}）`
    : `${G.preset.name} で対局開始（シード ${G.seed}）`);
  drainLog();
  draw();
  if (G.online) resetClocks();
  G.lastBonus = G.engine.players.map((p) => p.bonus);
  G.lastKyokuShown = false;
  loop();
  // 開始を押すのが遅れた間に届いていた手を、ここでまとめて入れる
  if (G.online) pumpInbox();
}

// ---------------------------------------------------------------------------
// 持ち時間（オンラインのときだけ）
//
// 天鳳・雀魂と同じ「基礎時間＋考慮時間」の2段にする。
// 基礎時間はふつうに打つぶんには足りる長さで、迷ったときだけ
// 考慮時間が減る。減った考慮時間は、その局のあいだ戻らない。
//
// ひとりで打つ卓には入れない。待たせる相手が居ないのに急かす理由がない。
// ---------------------------------------------------------------------------
const CLOCK = { base: 8000, pool: 20000, grace: 3000 };

/** 局のはじめに、全員の考慮時間を戻す */
function resetClocks() {
  if (!G || !G.online) return;
  G.clock = { seat: null, token: -1, startedAt: 0, pool: G.engine.players.map(() => CLOCK.pool) };
}

/** いま手番の席（人が待たれている席）。誰も待っていなければ null */
function actingSeat() {
  if (!G || !G.engine) return null;
  if (G.engine.finished || G.engine.phase === 'kyokuEnd') return null;
  if (G.waiting) return G.waiting.seat;
  return G.remoteWait != null ? G.remoteWait : null;
}

/**
 * 手番が変わったら時計を掛け直す。
 *
 * 席だけを見ていると、あいだのAIが自動で打つぶん「自分→自分」に見えて
 * 掛け直されない。何手目かも一緒に見て、手が進んだら必ず掛け直す。
 */
function syncClock() {
  if (!G || !G.online) return;
  if (!G.clock) resetClocks();
  const seat = actingSeat();
  const token = G.online.applied;
  if (seat === G.clock.seat && token === G.clock.token) return;
  G.clock.seat = seat;
  G.clock.token = token;
  G.clock.startedAt = seat == null ? 0 : Date.now();
  if (seat == null) stopTicker(); else startTicker();
}

function startTicker() {
  if (G.ticker) return;
  G.ticker = setInterval(tick, 200);
  tick();
}
function stopTicker() {
  if (!G || !G.ticker) return;
  clearInterval(G.ticker);
  G.ticker = null;
  paintClock(null);
}

/** 残り時間を計算して、表示と時間切れの処理をする */
function tick() {
  if (!G || !G.online || !G.clock || G.clock.seat == null) { stopTicker(); return; }
  const seat = G.clock.seat;
  const spent = Date.now() - G.clock.startedAt;
  const baseLeft = Math.max(0, CLOCK.base - spent);
  const poolLeft = Math.max(0, G.clock.pool[seat] - Math.max(0, spent - CLOCK.base));
  paintClock({ seat, baseLeft, poolLeft });
  if (baseLeft > 0 || poolLeft > 0) return;

  // 時間切れ。自分の席は自分で、離席中の席は部屋主が代わりに打つ。
  G.clock.pool[seat] = 0;
  if (seat === G.mySeat) { stopTicker(); autoPlayFor(seat); return; }
  const p = G.online.seats[seat];
  const away = p && !p.cpu && p.connected === false;
  if (away && G.mySeat === G.online.host && spent > CLOCK.base + CLOCK.pool + CLOCK.grace) {
    stopTicker();
    autoPlayFor(seat);
  }
}

/** 時間切れのときの手。ツモ切り、無ければ最初の打牌、鳴きの場面ならスルー */
function autoPlayFor(seat) {
  const e = G.engine;
  const choices = e.getChoices(seat) || [];
  const who = e.players[seat] ? e.players[seat].name : `席${seat}`;
  if (!choices.length) { pushLog('sys', `※ 時間切れだが${who}に打てる手がない`); drainLog(); return; }
  pushLog('sys', `${who}：時間切れのため自動で処理しました`);
  const pass = choices.find((c) => c.type === 'pass');
  if (pass) { submitFor(seat, { type: 'pass' }); return; }
  const discard = choices.find((c) => c.type === 'discard');
  if (!discard) {
    // 打牌もスルーも無い場面（和了だけなど）は、勝手に選ばない。
    // 中身の足りない手を送ると、その席がずっと止まってしまう。
    pushLog('sys', `※ ${who}の時間切れだが、自動で選べる手がない`);
    drainLog();
    return;
  }
  const drawn = e.players[seat].drawn;
  const tileId = drawn && discard.tileIds.includes(drawn.id) ? drawn.id : discard.tileIds[0];
  submitFor(seat, { type: 'discard', tileId });
}

/** 席を指定して手を送る（自分の席なら通常の経路と同じ） */
function submitFor(seat, action) {
  drainLog();
  if (seat === G.mySeat) {
    G.waiting = null;
    G.mode = 'idle';
    G.riichiIds = null;
    G.selectedTileId = null;
    G.sending = true;
  }
  sendAct(G.online.no, seat, action);
  draw();
}

/** 残り時間を画面に反映する。描き直しは重いので、ここは値だけ触る */
function paintClock(state) {
  if (!G || !G.dom || !G.dom.board) return;
  const all = [...G.dom.board.querySelectorAll('.seat-clock')];
  if (G.dom.myClock) all.push(G.dom.myClock);
  for (const el of all) el.classList.remove('on', 'urgent');
  if (!state) return;
  const el = state.seat === G.mySeat
    ? G.dom.myClock
    : G.dom.board.querySelector(`.seat-${seatPos(G.engine.n, state.seat)} .seat-clock`);
  if (!el) return;
  const sec = Math.ceil((state.baseLeft + state.poolLeft) / 1000);
  const ratio = state.baseLeft > 0
    ? state.baseLeft / CLOCK.base
    : state.poolLeft / Math.max(1, CLOCK.pool);
  el.classList.add('on');
  if (state.baseLeft === 0) el.classList.add('urgent');
  el.style.setProperty('--left', `${Math.max(0, Math.min(1, ratio)) * 100}%`);
  const num = el.querySelector('.seat-clock-num');
  if (num) num.textContent = String(sec);
}

/**
 * サーバから届いた行動を貯める。
 *
 * 開始を押すのが人によって遅い・早いがあるので、engine がまだ無い間も
 * 取りこぼさないよう、いったん受け皿に入れておく。
 */
function receiveActs(acts) {
  if (!G || !G.online) return;
  for (const a of acts) {
    if (a.seq >= G.online.applied) G.online.inbox.set(a.seq, a);
  }
  pumpInbox();
}

/**
 * 受け皿から、順番どおりに engine へ入れる。
 * 抜けているところで止め、しばらく埋まらなければ配り直してもらう。
 */
function pumpInbox() {
  if (!G || !G.online || !G.engine) return;
  let moved = false;
  while (G.online.inbox.has(G.online.applied)) {
    const a = G.online.inbox.get(G.online.applied);
    G.online.inbox.delete(G.online.applied);
    if (a.action && a.action.type === 'nextKyoku') {
      // 誰が押しても1回だけ効く（先に進んでいたら何もしない）
      if (G.engine.phase === 'kyokuEnd') { closeOverlay(); G.engine.nextKyoku(); resetClocks(); }
    } else {
      const r = G.engine.act(a.seat, a.action);
      if (r && r.error) pushLog('sys', `※ ${r.error}`);
    }
    G.online.applied += 1;
    moved = true;
  }
  if (moved) {
    G.sending = false;
    drainLog();
    loop();
    return;
  }
  // 抜けたまま届かないときだけ、取り直しをお願いする
  if (G.online.inbox.size && !G.online.resyncTimer) {
    G.online.resyncTimer = setTimeout(() => {
      G.online.resyncTimer = null;
      if (G && G.online && G.online.inbox.size) resync(G.online.no, G.online.applied);
    }, 1500);
  }
}

function loop() {
  if (!G || !G.engine) return;
  if (G.timer) clearTimeout(G.timer);
  const e = G.engine;
  if (e.finished) {
    drainLog(); draw(); stopTicker();
    // 対局が終わる局も、まず和了の点数と役を見せる。
    // これまでは終局の判定が先に来ていたので、最後の1局だけ
    // 何で和了ったのかが分からないまま最終結果へ飛んでいた。
    if (e.kyokuEnd && !G.lastKyokuShown) {
      G.lastKyokuShown = true;
      flashResult(e.kyokuEnd, () => showKyokuResult());
      return;
    }
    showFinal();
    return;
  }
  if (e.phase === 'kyokuEnd') {
    drainLog(); draw(); stopTicker();
    flashResult(e.kyokuEnd, () => showKyokuResult());
    return;
  }
  const r = e.advance(decide, 1);
  drainLog();
  if (r.waiting) {
    // オンラインでは、自分以外の人の番はサーバから届くまで待つ。
    // AIの手は乱数を使わないので、どの端末で計算しても同じ手になる。
    if (G.online && r.waiting.seat !== G.mySeat) {
      G.waiting = null;
      G.remoteWait = r.waiting.seat;
      draw();
      syncClock();
      return;
    }
    G.remoteWait = null;
    G.waiting = r.waiting;
    draw();
    syncClock();
    maybeAutoDiscard();
    return;
  }
  G.remoteWait = null;
  G.waiting = null;
  draw();
  G.timer = setTimeout(loop, G.speed);
}

function act(action) {
  const e = G.engine;
  const seat = G.waiting ? G.waiting.seat : G.mySeat;
  G.waiting = null;
  G.mode = 'idle';
  G.riichiIds = null;
  G.selectedTileId = null;
  // オンラインでは、順番を決めるのはサーバ。自分の手も一度預けて、
  // 戻ってきた順に適用する。そうしないと端末ごとに並びが変わる。
  if (G.online) {
    G.sending = true;
    sendAct(G.online.no, seat, action);
    draw();
    return;
  }
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
      case 'kyokuStart': {
        const label = `${['東', '南', '西', '北'][ev.wind]}${ev.kyoku}局`;
        pushLog('sys', `── ${label} ${ev.honba}本場（親：${nameOf(ev.dealer)}）`);
        // 何局が始まったのかを一度だけ大きく出す。
        // ログだけだと、局が変わったことに気づかないまま打ち始めてしまう。
        kyokuBanner(label, ev.honba ? `${ev.honba}本場` : `親：${nameOf(ev.dealer)}`);
        break;
      }
      case 'discard': pushLog('', `${nameOf(ev.seat)}：${ev.tile.name} 切り${ev.riichi ? '（リーチ宣言牌）' : ''}`); break;
      case 'riichi':
        pushLog('win', `${nameOf(ev.seat)}：${ev.open ? 'オープンリーチ' : 'リーチ'}${ev.double ? '（ダブル）' : ''}`);
        toast(ev.open ? 'オープンリーチ' : 'リーチ', nameOf(ev.seat), 'rose');
        callBanner(ev.open ? 'オープンリーチ' : 'リーチ', 'riichi');
        break;
      case 'call': {
        const label = { pon: 'ポン', chi: 'チー', kan: 'カン' }[ev.kind] || ev.kind;
        pushLog('', `${nameOf(ev.seat)}：${label}（${nameOf(ev.from)}の${ev.tile.name}）`);
        callBanner(label, 'call');
        break;
      }
      case 'kan': {
        const label = { ankan: '暗槓', kakan: '加槓', kanadd: 'カンに追加' }[ev.kind] || 'カン';
        pushLog('', `${nameOf(ev.seat)}：${label} ${typeName(ev.t)}`);
        break;
      }
      case 'kanDora': pushLog('rule', `槓ドラ表示：${ev.tile.name}`); break;
      case 'kita': pushLog('rule', `${nameOf(ev.seat)}：${ev.tile.name}を抜く（${ev.count}枚目）`); break;
      case 'flower':
        pushLog('rule', `${nameOf(ev.seat)}：華牌「${ev.label}」を抜く${ev.messages && ev.messages.length ? ' → ' + ev.messages.join(' / ') : ''}`);
        toast(`華牌「${ev.label}」`, (ev.messages || [])[0] || `${nameOf(ev.seat)}が抜きました`, 'amber');
        break;
      case 'wareme':
        pushLog('rule', `割れ目：${nameOf(ev.seat)}（サイコロ ${ev.dice}）`);
        toast('割れ目', ev.all ? '全員が対象です' : `${nameOf(ev.seat)}の収支が倍になります`, 'rose');
        break;
      case 'specialDraw':
        pushLog('rule', `${nameOf(ev.seat)}：${ev.name} をツモ（+${ev.bonus}BP）`);
        toast(ev.name, `+${ev.bonus}BP`, 'violet');
        break;
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
  if (G.online) drawNetState();
  e.debug.showCpuHands = G.debug.showCpuHands;
  e.debug.forceAlice = G.debug.forceAlice;
  e.debug.forceDice = G.debug.forceDice;
  const s = e.snapshot(G.mySeat);
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
  // 牌の構成そのものが変わるルール（清一色ゲームの2セット混ぜなど）も、
  // 打っている本人がいちばん知りたいことなのでここに出す
  const counts = (R.wall && R.wall.tileCounts) || {};
  const SUIT_LABEL = { m: '萬子', p: '筒子', s: '索子', z: '字牌' };
  const many = Object.keys(counts).filter((c) => counts[c] > 4);
  if (many.length) {
    specials.push(many.map((c) => {
      // 「1p」のような1種ずつの指定と、「p」のような色でまとめた指定がある
      const label = SUIT_LABEL[c] || typeName(codeToType(c));
      return `${label}${counts[c]}枚`;
    }).join('・'));
  }
  const rot = (R.wall && R.wall.suitRotation) || [];
  if (rot.length > 1) {
    specials.push(`${rot.map((c) => SUIT_LABEL[c] || c).join('と')}が局ごとに交互`);
  }
  if (R.wall && R.wall.backColors && R.wall.backColors.enabled) specials.push('2セット混ぜ');
  if (R.local.chiitoiMultiPair) specials.push('七対子8枚使い');
  if (R.local.shouhaiMighty && R.local.shouhaiMighty.enabled) specials.push('少牌マイティ');
  for (const y of R.localYaku || []) {
    if (y && y.enabled !== false && LOCAL_YAKU_DEFS[y.id]) specials.push(LOCAL_YAKU_DEFS[y.id].name);
  }
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
  // 卓の中央にも同じ内容が出るので、狭い画面ではこちらを隠す（.top-stat）
  const item = (k, v) => h('div.top-stat', h('div.k', { text: k }), h('div.v', { text: v }));
  // どこから来たかは分からないので、来た道を戻す。履歴が無いときはホームへ。
  // 狭い横持ちでは文字を畳んで矢印だけにするので、印と語を分けて持たせる
  const back = h('button.chip.chip-btn.game-back', { type: 'button' },
    h('span.mark', { text: '←' }), h('span', { text: 'もどる' }));
  back.addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.hash = '#/';
  });
  top.appendChild(back);
  top.appendChild(item('ルール', G.preset.name));
  if (G.event) top.appendChild(h('span.chip.chip-brass', { text: `イベント卓：${G.event.name}` }));
  top.appendChild(item('場', `${s.round.windName}${s.round.kyoku}局 ${s.round.honba}本場`));
  // 残り牌は、数字だけだと「あと何巡あるか」が掴みにくいのでゲージも出す
  const total = Math.max(1, s.wallTotal || 70);
  const ratio = Math.max(0, Math.min(1, s.wallRemaining / total));
  const low = s.wallRemaining <= 8;
  top.appendChild(h('div.wall-box.top-stat',
    h('div.k', { text: '残り' }),
    h('div.row.gap-4',
      h('div.v', { class: low ? 'low' : '', text: String(s.wallRemaining) }),
      h('div.wall-gauge', h('div.wall-gauge-fill', {
        class: low ? 'low' : '',
        style: { width: `${(ratio * 100).toFixed(0)}%` },
      })))));
  top.appendChild(h('div.top-stat',
    h('div.k', { text: '供託' }),
    h('div.row.gap-4', { style: { height: '22px' } },
      s.round.kyotaku ? Array.from({ length: s.round.kyotaku }, () => h('div.stick')) : h('div.v', { text: '0' }))));
  const dora = h('div.dora-box.top-stat');
  dora.appendChild(h('div.k', { text: 'ドラ表示' }));
  s.dora.forEach((d) => dora.appendChild(tileEl(d, { size: 'sm', cls: 'dora-ind' })));
  top.appendChild(dora);
  top.appendChild(h('div.grow'));

  // 速度や打ち方の設定は、卓の上に並べるとスマホで5段になり、
  // 卓そのものが画面の下に押し出されていた。ひとまとめにして、
  // 押したときだけ開く。
  const gear = h('button.act.act-gear', { title: '速度と打ち方の設定' },
    icon('settings', 13), h('span', { text: '設定' }));
  gear.addEventListener('click', () => showTableSettings());
  top.appendChild(gear);

  // 打っている最中に「この店のルールは何だったか」を確かめるためのボタン。
  // 卓を広く使うため右の欄は既定で畳んであるので、ここが入口になる。
  // 何が出るかが一目で分かるよう、印と「ルール」の語を並べて出す。
  const side = h('button.act.act-rule', { title: 'この卓のルールと、いまの局の履歴を見る' },
    icon('rule', 14),
    h('span', { text: G.sideOpen ? 'ルールを閉じる' : 'ルールを見る' }));
  if (G.sideOpen) side.classList.add('on');
  side.addEventListener('click', () => {
    G.sideOpen = !G.sideOpen;
    savePref('sideOpen', G.sideOpen);
    G.dom.main.classList.toggle('side-closed', !G.sideOpen);
    draw();
  });
  top.appendChild(side);

  // デバッグは検証用。ふだんは出さない（URLに debug=1 を付けたときだけ）
  if (G.debugAvailable) {
    const dbg = h('button.act', { style: { padding: '4px 10px', fontSize: '11px', fontWeight: '500' } }, icon('bug', 13), h('span', { text: 'デバッグ' }));
    dbg.addEventListener('click', () => {
      G.debugOpen = !G.debugOpen;
      G.dom.debug.classList.toggle('hide', !G.debugOpen);
    });
    top.appendChild(dbg);
  }
}

/**
 * 速度と打ち方の設定。
 * 卓の上に常時並べるほど頻繁に触るものではないので、ここにまとめる。
 */
function showTableSettings() {
  const body = h('div.sheet-body');

  const speedRow = h('div.row.gap-4.wrapflex');
  SPEEDS.forEach((x) => {
    const b = h('button.act', { text: x.label });
    if (x.v === G.speed) b.classList.add('on');
    b.addEventListener('click', () => { G.speed = x.v; draw(); showTableSettings(); });
    speedRow.appendChild(b);
  });
  body.appendChild(h('div.set-row',
    h('div',
      h('div.set-title', { text: 'CPUの打つ速さ' }),
      h('div.set-desc', { text: '考えている間の待ち時間です。' })),
    speedRow));

  const toggle = (title, desc, on, onChange) => {
    const b = h('button.act', { text: on ? 'ON' : 'OFF' });
    if (on) b.classList.add('on');
    b.addEventListener('click', () => { onChange(); showTableSettings(); });
    return h('div.set-row',
      h('div', h('div.set-title', { text: title }), h('div.set-desc', { text: desc })), b);
  };
  body.appendChild(toggle('2度押しで確定', '打つ牌を1度目で選び、2度目で確定します。押し間違いを防げます。',
    G.confirmDiscard, () => {
      G.confirmDiscard = !G.confirmDiscard;
      G.selectedTileId = null;
      savePref('confirmDiscard', G.confirmDiscard);
      draw();
    }));
  body.appendChild(toggle('リーチ後は自動でツモ切り', 'リーチしたあと、ほかに選ぶものが無いときは自動で切ります。',
    G.autoTsumogiri, () => {
      G.autoTsumogiri = !G.autoTsumogiri;
      savePref('autoTsumogiri', G.autoTsumogiri);
      draw();
      if (G.autoTsumogiri) maybeAutoDiscard();
    }));

  // 珍しい場面（同じ牌が5枚以上そろう等）は、待っていても滅多に来ない。
  // 店のルールが思ったとおりに動くかを確かめたいとき用の操作。
  body.appendChild(toggle('検証用の操作を出す',
    '手牌を作って、そのルールが思ったとおりに動くか確かめられます。ふだんの対局では使いません。',
    G.debugAvailable, () => {
      G.debugAvailable = !G.debugAvailable;
      savePref('debugPanel', G.debugAvailable);
      G.debugOpen = false;
      G.dom.debug.classList.add('hide');
      buildDebugPanel();
      draw();
    }));

  const close = h('button.btn.btn-brass', { text: '閉じる' });
  close.addEventListener('click', () => closeOverlay());
  overlay(h('div.sheet',
    h('div.sheet-head', h('div.eyebrow', { text: 'SETTINGS' }), h('h3', { text: '設定' })),
    body,
    h('div.sheet-foot', close)));
}

/** 自分の席を必ず下辺に置く。相対位置なので、席が変わっても見え方は変わらない */
function seatPos(n, seat) {
  const rel = ((seat - (G ? G.mySeat : 0)) % n + n) % n;
  if (n === 4) return ['bottom', 'right', 'top', 'left'][rel];
  return ['bottom', 'right', 'left'][rel];
}

function drawBoard(s) {
  const board = clear(G.dom.board);
  const n = s.players.length;
  // 三麻には対面がいない。上の段をそのまま空けておくと卓の1/3が
  // 何も無い緑のままになるので、席数を印にして高さを配り直す
  board.classList.toggle('p3', n === 3);
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
      // 供託のリーチ棒。卓の真ん中に出ていないと、場にいくら乗っているかが
      // 分からない。天鳳・雀魂はどちらも卓の中央に置いている。
      s.round.kyotaku
        ? h('div.center-kyotaku',
          h('div.sticks', Array.from({ length: Math.min(s.round.kyotaku, 8) }, () => h('div.stick'))),
          h('span.center-sub', { text: `供託 ${fmt(s.round.kyotaku * G.rules.scoring.riichiStick)}点` }))
        : null,
      s.wareme != null ? h('div.center-sub', { text: `割れ目：${s.players[s.wareme].name}` }) : null));
  board.appendChild(center);
  // 自分の捨て牌・副露はbottomエリアへ
  const me = s.players[G.mySeat];
  // 自分の席も、自分の番なら光らせる（他家と同じ扱いにする）
  const myTurn = actingSeat() === G.mySeat && !s.finished && s.phase !== 'kyokuEnd';
  board.appendChild(h('div.seat.seat-bottom', { class: `${me.riichi ? 'riichi' : ''} ${myTurn ? 'active' : ''}` },
    seatHead(me, s),
    meldsEl(me),
    discardsEl(me)));
}

/**
 * 通信の状態を卓の上に出す。
 *
 * 黙って止まると「自分の操作が効かない」のか「相手を待っている」のか
 * 分からない。つながっていないときだけ、その旨と入り直す手立てを出す。
 */
function drawNetState() {
  if (!G || !G.online || !G.dom || !G.dom.top) return;
  const st = netStatus();
  const existing = G.dom.netBar;
  if (st === 'open') {
    if (existing) { existing.remove(); G.dom.netBar = null; }
    return;
  }
  const text = st === 'connecting' ? 'つなぎ直しています…' : '通信が切れました';
  if (existing) {
    existing.querySelector('.net-bar-text').textContent = text;
    existing.classList.toggle('is-down', st !== 'connecting');
    return;
  }
  const retry = h('button.act', { text: '入り直す' });
  retry.addEventListener('click', () => { connect(); resync(G.online.no, G.online.applied); drawNetState(); });
  const bar = h('div.net-bar', { class: st === 'connecting' ? '' : 'is-down' },
    h('span.net-bar-text', { text }), retry);
  G.dom.netBar = bar;
  // 卓の枠は3段の格子でできている。あいだに差し込むと段がずれるので、
  // 浮かせて重ねる（CSSで position:absolute にしてある）。
  G.dom.top.parentElement.appendChild(bar);
}

/** その席の人が接続を切っているか（AIの席は対象外） */
function awaySeat(seat) {
  if (!G || !G.online) return false;
  const p = G.online.seats[seat];
  return !!p && !p.cpu && p.connected === false;
}

function seatHead(p, s) {
  const waited = actingSeat();
  const isTurn = (waited != null ? waited === p.seat : s.turn === p.seat)
    && !s.finished && s.phase !== 'kyokuEnd';
  return h('div.seat-head',
    h('div.seat-wind', { class: p.isDealer ? 'dealer' : '', text: p.wind }),
    isTurn ? h('div.turn-dot') : null,
    // オンラインのときだけ、その席の残り時間を出す
    G.online ? h('div.seat-clock', h('span.seat-clock-num'), h('i.seat-clock-bar')) : null,
    // 席を外している人は、待たされている理由が分かるように出す
    G.online && awaySeat(p.seat) ? h('span.badge-away', { text: '接続待ち' }) : null,
    h('div.grow', { style: { fontSize: '12.5px' } }, p.name),
    p.riichi ? h('span.badge-riichi', { text: p.openRiichi ? 'オープン' : 'リーチ' }) : null,
    s.wareme === p.seat ? h('span.badge-wareme', { text: '割れ目' }) : null,
    h('div.seat-pts', { text: fmt(p.points) }),
    G.rules.bonus.enabled ? chipTag(p.bonus) : null);
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

/**
 * 鳴き1組を牌で組み立てる。卓の上でも結果画面でも同じ形にする。
 *
 * 麻雀では鳴いた牌を横に倒し、倒す位置で出どころを示す決まりがある
 * （上家＝左端・対面＝真ん中・下家＝右端）。これを守らないと、
 * 誰が振り込んだのかを卓の上から追えない。天鳳・雀魂も同じ置き方。
 *
 * @param {object} m    鳴き（kind/concealed/from/calledTileId/tiles）
 * @param {number} seat 鳴いた人の席
 */
function meldTiles(m, seat) {
  // 暗槓は「両端を伏せ、中の2枚を表」にするのが麻雀の決まり。
  // 4枚とも伏せると何を槓したのか誰にも分からず、ドラが増えた理由も
  // 追えない。天鳳・雀魂も両端だけ伏せている。
  // 5枚目以降（1種8枚のルールで足したぶん）は表向きのまま置く。
  const hide = (i) => m.kind === 'kan' && m.concealed && (i === 0 || i === 3);
  let tiles = m.tiles.map((t, i) => ({
    t: hide(i) ? { hidden: true } : t,
    called: m.calledTileId != null && t.id === m.calledTileId,
  }));
  if (!m.concealed && m.from != null && seat != null) {
    const n = G.rules.game.players;
    const rel = ((m.from - seat) + n) % n;  // 1=下家、n-1=上家、それ以外=対面
    const called = tiles.find((x) => x.called);
    if (called) {
      const rest = tiles.filter((x) => x !== called);
      if (rel === n - 1) tiles = [called, ...rest];
      else if (rel === 1) tiles = [...rest, called];
      else tiles = [rest[0], called, ...rest.slice(1)];
    }
  }
  return h('div.meld', tiles.map((x) => tileEl(
    x.t, { size: 'sm', attrs: x.called && !m.concealed ? { class: 'side' } : null },
  )));
}

function meldsEl(p) {
  const kita = p.kita || [];
  if (!p.melds.length && !kita.length && !p.flowers.length) return null;
  const wrap = h('div.melds');
  for (const m of p.melds) wrap.appendChild(meldTiles(m, p.seat));
  // 抜きドラ（北・ガリ）と華牌は別グループにする
  const k = nukiGroup(kita, '抜き');
  if (k) wrap.appendChild(k);
  const f = nukiGroup(p.flowers, '華');
  if (f) wrap.appendChild(f);
  return wrap;
}

function discardsEl(p) {
  const lastId = G.engine.lastDiscard ? G.engine.lastDiscard.tile.id : null;
  // 河が伸びたら牌を一段詰める。序盤は大きく読みやすく、終盤も
  // 全部見えるようにする（送って隠すと、それまでの捨て牌が読めない）
  const dense = p.discards.length > 10 ? '.dense' : '';
  const el = h(`div.discards${dense}`, p.discards.map((t) => {
    const cls = [];
    if (t.id === lastId) cls.push('just');
    // リーチ宣言牌は横に倒す（どこで曲げたかが河を見れば分かる）
    if (p.riichiTileId && t.id === p.riichiTileId) cls.push('side');
    return tileEl(t, { size: 'xs', attrs: cls.length ? { class: cls.join(' ') } : null });
  }));
  // 詰めても入りきらないときの保険。いちばん新しい捨て牌を必ず見せる
  requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  return el;
}

function seatEl(p, s, cls) {
  // 鳴きの受け答え中は、engine の turn（牌を切った席）と
  // 実際に待たれている席が違う。待たれている席を光らせる。
  const waited = actingSeat();
  const active = (waited != null ? waited === p.seat : s.turn === p.seat) && !s.finished;
  const el = h(`div.seat.${cls}`, { class: `${active ? 'active' : ''} ${p.riichi ? 'riichi' : ''}` },
    seatHead(p, s),
    h('div.hand-row', p.hand.map((t) => tileEl(t, { size: 'xs' }))),
    meldsEl(p),
    discardsEl(p));
  return el;
}

function drawMy(s) {
  const me = s.players[G.mySeat];
  clear(G.dom.myArea);
  const hand = clear(G.dom.hand);
  const choices = G.waiting ? G.waiting.choices : [];
  const discard = choices.find((c) => c.type === 'discard');
  const selectable = G.mode === 'riichiSelect' ? G.riichiIds : (discard ? discard.tileIds : null);

  // 同種牌は代表1枚しか選択肢に含まれないため、見た目が同じ牌はすべて押せるようにする。
  // 鍵はエンジン側と同じものを使う。ずれると、押した牌と切れる牌が食い違う。
  const keyOf = tileFaceKey;
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
    const row = h('div.row.center.gap-8', { style: { marginTop: '6px' } },
      h('div.shanten-tag', { class: tag.cls, text: tag.text }));
    // 待ち牌と「まだ見えていない枚数」を出す（初心者が一番知りたい情報）
    // 牌を選んでいる最中は「その牌を切ったらどうなるか」を先に見せる
    const picked = G.selectedTileId != null
      ? G.engine.waitsAfterDiscard(G.mySeat, G.selectedTileId) : null;
    const waitList = picked || s.waits;
    if (waitList && waitList.length) {
      row.appendChild(h('div.waits',
        h('span.waits-label', { text: picked ? 'これを切ると' : '待ち' }),
        waitList.map((w) => h('div.wait-item',
          tileEl({ t: w.t, name: w.name }, { size: 'xs' }),
          h('span.wait-left', { class: w.left === 0 ? 'zero' : '', text: `${w.left}` })))));
    }
    G.dom.myArea.appendChild(row);
  }

  const doraSet = new Set(s.doraTypes || []);
  const drawnId = me.drawn && !me.drawn.hidden ? me.drawn.id : null;
  const tiles = me.hand.filter((t) => t.id !== drawnId);
  // 華牌は打牌の選択肢に入らない。押して抜けるよう、別に拾っておく
  const flowerIds = new Set(choices.filter((c) => c.type === 'flower').map((c) => c.tileId));
  const render = (t, gap) => {
    const isFlowerPick = flowerIds.has(t.id);
    const id = isFlowerPick ? t.id : pickable.get(keyOf(t));
    const can = id !== undefined;
    const el = tileEl(t, {
      size: 'lg',
      gap,
      clickable: can,
      dora: doraSet.has(t.t),
      selected: G.confirmDiscard && G.selectedTileId === id,
      dim: !!selectable && !can,
      onClick: can ? () => onTileClick({ ...t, id }) : null,
    });
    // 長押し／右クリックで「この店でのこの牌の意味」を出す
    let timer = null;
    const start = () => { timer = setTimeout(() => { timer = null; showTileInfo(t, s, el); }, 420); };
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('contextmenu', (ev) => { ev.preventDefault(); showTileInfo(t, s, el); });
    return el;
  };
  tiles.forEach((t) => hand.appendChild(render(t, false)));
  if (drawnId) hand.appendChild(render(me.drawn, true));
  // 少牌マイティ：手元にある「何にでもなる1枚」を、切れない牌として並べて見せる
  for (let i = 0; i < (me.mighty || 0); i++) {
    hand.appendChild(h('div.tile.tile-lg.mighty-tile', { title: '何にでもなる牌（切れません）' },
      h('div.tile-face', h('span.mighty-mark', { text: '萬能' }))));
  }
}

function onTileClick(t) {
  if (G.mode === 'riichiSelect') { act({ type: 'riichi', tileId: t.id, open: G.riichiOpen }); return; }
  // 華牌は切る牌ではなく「抜く」牌。手牌のそれを押したら、そのまま抜く
  const flower = (G.waiting ? G.waiting.choices : [])
    .find((c) => c.type === 'flower' && c.tileId === t.id);
  if (flower) { act({ type: 'flower', tileId: t.id }); return; }
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

/**
 * リーチ後の自動ツモ切り。
 * リーチしたあとは選ぶ余地が無いので、毎回タップさせない。
 * ツモ和了・カン・北抜きなど、選ぶものがあるときは自動にしない。
 */
function maybeAutoDiscard() {
  if (!G || !G.autoTsumogiri || !G.waiting) return false;
  const me = G.engine.players[G.mySeat];
  if (!me || !me.riichi) return false;
  const choices = G.waiting.choices || [];
  const discard = choices.find((c) => c.type === 'discard');
  if (!discard) return false;
  // 打牌以外の選択肢があるなら、本人に決めてもらう
  if (choices.some((c) => c.type !== 'discard')) return false;
  const drawn = me.drawn;
  if (!drawn || !discard.tileIds.includes(drawn.id)) return false;
  G.timer = setTimeout(() => act({ type: 'discard', tileId: drawn.id }), Math.max(160, G.speed * 0.6));
  return true;
}

function drawActions(s) {
  const box = clear(G.dom.actions);
  const hint = G.dom.hint;
  const choices = G.waiting ? G.waiting.choices : [];
  const myTurn = !!choices.length && !s.finished && s.phase !== 'kyokuEnd';
  G.dom.hand.classList.toggle('my-turn', myTurn);
  if (!choices.length) {
    clear(hint);
    if (!s.finished && s.phase !== 'kyokuEnd') {
      // 止まっているのか考えているのか分かるよう、点を打たせる
      let who = 'CPUの手番です';
      if (G.sending) who = '送信しています';
      else if (G.online && G.remoteWait != null) {
        const p = s.players[G.remoteWait];
        who = `${(p && p.name) || 'ほかの方'}の手番です`;
      }
      hint.appendChild(h('span', { text: who }));
      hint.appendChild(h('span.thinking', h('i'), h('i'), h('i')));
    }
    return;
  }
  if (G.mode === 'riichiSelect') {
    hint.textContent = 'リーチ宣言牌を選んでください';
    const cancel = h('button.act.act-pass', { text: 'やめる' });
    cancel.addEventListener('click', () => { G.mode = 'idle'; G.riichiIds = null; draw(); });
    box.appendChild(cancel);
    return;
  }
  const add = (label, cls, fn, tiles) => {
    const b = h(`button.act${cls ? `.${cls}` : ''}`);
    b.appendChild(h('span', { text: label }));
    // どの牌で鳴くのかが、文字だけだと分からない。使う牌を並べて見せる
    if (tiles && tiles.length) {
      b.appendChild(h('span.act-tiles', tiles.map((t) => tileEl(t, { size: 'xs' }))));
    }
    b.addEventListener('click', fn);
    box.appendChild(b);
  };
  const me = s.players[G.mySeat];
  const byIds = (ids) => (ids || []).map((id) => me.hand.find((t) => t.id === id)).filter(Boolean);
  const claimed = G.engine.pending && G.engine.pending.tile ? [G.engine.pending.tile] : [];
  for (const c of choices) {
    switch (c.type) {
      case 'tsumo': add('ツモ', 'act-win', () => act({ type: 'tsumo' })); break;
      case 'ron': add('ロン', 'act-win', () => act({ type: 'ron' })); break;
      case 'riichi':
        add(c.open ? 'オープンリーチ' : 'リーチ', 'act-riichi', () => {
          G.mode = 'riichiSelect'; G.riichiIds = c.tileIds; G.riichiOpen = !!c.open; draw();
        });
        break;
      case 'pon':
        add(c.label, 'act-call', () => act({ type: 'pon', tileIds: c.tileIds }), [...claimed, ...byIds(c.tileIds)]);
        break;
      case 'chi':
        add(c.label, 'act-call', () => act({ type: 'chi', tileIds: c.tileIds }), [...claimed, ...byIds(c.tileIds)]);
        break;
      case 'kan':
        add(c.label, 'act-call', () => act({ type: 'kan', kind: c.kind, t: c.t }), [{ t: c.t }]);
        break;
      case 'kita': add(c.label || '北抜き', 'act-nuki', () => act({ type: 'kita', t: c.t })); break;
      // 華牌を自分で抜く設定のとき。エンジンは選択肢を出していたのに
      // ここに分岐が無く、ボタンが1つも出ていなかった
      case 'flower':
        add(c.label || '華牌を抜く', 'act-nuki', () => act({ type: 'flower', tileId: c.tileId }), [{ t: c.t }]);
        break;
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

/** 和了形を牌で見せる。何で和了ったかが一目で分かるようにする。 */
function winHandView(d) {
  if (!d.handTiles || !d.handTiles.length) return null;
  const box = h('div.win-hand');
  const row = h('div.hand-row');
  for (const t of d.handTiles) row.appendChild(tileEl(t, { size: 'sm' }));
  if (d.winTile) {
    row.appendChild(h('div.win-sep'));
    row.appendChild(tileEl(d.winTile, { size: 'sm', cls: 'tile-win' }));
  }
  box.appendChild(row);
  // 鳴きも卓の上と同じ形（暗槓は伏せ、鳴いた牌は横）で見せる。
  // 「何で和了ったか」を確かめる画面なので、卓と違う形だと読み替えがいる。
  if (d.meldsView && d.meldsView.length) {
    const mr = h('div.hand-row.meld-row');
    for (const m of d.meldsView) mr.appendChild(meldTiles(m, d.seat));
    box.appendChild(mr);
  }
  return box;
}

/**
 * 鳴き・リーチを、卓の上に一瞬だけ出す。
 * ログを目で追わなくても、何が起きたかが分かるようにする。
 */
/** 局のはじまりを卓の中央に出す。副露の表示より長めに、静かに消す */
function kyokuBanner(title, sub) {
  if (!G || !G.dom || !G.dom.toasts) return;
  const host = G.dom.toasts.parentElement;
  if (!host) return;
  const el = h('div.kyokuban',
    h('span.kyokuban-title', { text: title }),
    sub ? h('span.kyokuban-sub', { text: sub }) : null);
  host.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 1100);
}

function callBanner(text, tone) {
  if (!G || !G.dom || !G.dom.toasts) return;
  const host = G.dom.toasts.parentElement;
  if (!host) return;
  const el = h(`div.callban.callban-${tone}`, h('span', { text }));
  host.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

/**
 * チップ（BP）の枚数。チップが動くルールでは、
 * 数字だけだと増えたのか減ったのかが伝わらないので絵を添える。
 */
function chipTag(n) {
  return h('div.seat-bp', { class: n > 0 ? 'plus' : n < 0 ? 'minus' : '' },
    h('img.chip-icon', { src: 'img/ui/chip.png', alt: '', width: '14', height: '14' }),
    h('span', { text: signed(n) }));
}

/**
 * チップの増減を、その席から浮かせる。
 * 点棒とは別に出す。チップがよく動く店では、こちらが勝負の中身になる。
 */
function floatChips(deltas) {
  if (!deltas || !G.dom.board || !G.rules.bonus.enabled) return;
  const n = G.engine.n;
  deltas.forEach((d, seat) => {
    if (!d) return;
    const pos = seatPos(n, seat);
    const el = pos === 'bottom' ? G.dom.myArea : G.dom.board.querySelector(`.seat-${pos}`);
    if (!el) return;
    const tag = h(`div.chip-float${d > 0 ? '.plus' : '.minus'}`,
      h('img', { src: 'img/ui/chip.png', alt: '', width: '18', height: '18' }),
      h('span', { text: `${signed(d)}` }));
    el.appendChild(tag);
    setTimeout(() => tag.remove(), 1800);
  });
}

/**
 * サイコロチャンス。数字を並べるだけだと、当たった手応えが無い。
 * 自分でボタンを押して転がして、出目が止まるところまで見せる。
 *
 * 出目そのものは対局の計算で決まっている（ここで抽選はしない）。
 * 見せ方だけを担う。
 */
function dieEl(pips) {
  // 1の目が正面。転がしたあと、その目が正面に来るように向きを決める
  const FACE_TURN = {
    1: 'rotateX(0deg) rotateY(0deg)',
    2: 'rotateY(90deg)',
    3: 'rotateX(90deg)',
    4: 'rotateX(-90deg)',
    5: 'rotateY(-90deg)',
    6: 'rotateY(180deg)',
  };
  const FACE_CLASS = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'];
  const cube = h('div.die-cube');
  FACE_CLASS.forEach((c, i) => {
    const face = h(`div.die-face.${c}`);
    for (let k = 0; k < i + 1; k++) face.appendChild(h('i.pip'));
    cube.appendChild(face);
  });
  // 出目を渡さないときは「まだ振っていない」姿。
  // 面を正面に向けると 1 が出たように見えてしまうので、角をこちらに向ける。
  const idle = !FACE_TURN[pips];
  cube.style.setProperty('--turn', idle ? 'rotateX(-24deg) rotateY(34deg)' : FACE_TURN[pips]);
  return h('div.die', { class: idle ? 'die-idle' : '' }, cube);
}

function diceView(rolls) {
  const box = h('div.dice-box');
  box.appendChild(h('div.label', { text: 'サイコロチャンス' }));
  const stage = h('div.dice-stage');
  const total = h('div.dice-total');
  box.appendChild(stage);
  box.appendChild(total);

  const showRoll = (idx) => {
    clear(stage);
    const r = rolls[idx] || [];
    for (const pips of r) stage.appendChild(dieEl(pips));
    stage.classList.add('rolling');
    setTimeout(() => {
      stage.classList.remove('rolling');
      const sum = r.reduce((a, b) => a + b, 0);
      total.textContent = rolls.length > 1
        ? `${idx + 1}回目：${r.join('・')}（計${sum}）`
        : `${r.join('・')}（計${sum}）`;
      // ゾロ目で振り直しになった回は、続けて次を見せる
      if (idx + 1 < rolls.length) setTimeout(() => showRoll(idx + 1), 700);
    }, 900);
  };

  const roll = h('button.btn.btn-brass.btn-sm', { text: 'サイコロを振る' });
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    roll.disabled = true;
    roll.textContent = '転がしています…';
    showRoll(0);
    setTimeout(() => { roll.remove(); }, 900);
  };
  roll.addEventListener('click', go);
  box.appendChild(roll);
  // 振る前は目を伏せておく。出目を先に並べてしまうと、
  // ボタンを押す前に結果が分かってしまい、振る意味が無くなる。
  for (const _ of rolls[0] || []) stage.appendChild(dieEl(0));
  total.textContent = '押すと振れます';
  // 押さずに閉じる人もいるので、少し待って自分で振る。
  // ただし数え始めるのは「画面に出てから」。この箱は結果画面が組み立てられる
  // 時点で作られ、実際に表示されるのは和了の演出が終わってからなので、
  // 作った瞬間から数えると、開いたときにはもう振り終わっていた。
  const armWhenShown = () => {
    if (!box.isConnected) { setTimeout(armWhenShown, 120); return; }
    setTimeout(go, 3500);
  };
  armWhenShown();
  return box;
}

/** 点棒の増減を、その席の上に浮かせる */
function floatPoints(deltas) {
  if (!deltas || !G.dom.board) return;
  const n = G.engine.n;
  deltas.forEach((d, seat) => {
    if (!d) return;
    const pos = seatPos(n, seat);
    // 自分の席は卓の枠ではなく手元エリアに出す（下辺は自分の場所なので）
    const el = pos === 'bottom' ? G.dom.myArea : G.dom.board.querySelector(`.seat-${pos}`);
    if (!el) return;
    const tag = h(`div.pt-float${d > 0 ? '.plus' : '.minus'}`, { text: signed(d) });
    el.appendChild(tag);
    setTimeout(() => tag.remove(), 1600);
  });
}

/**
 * 局の終わりに、まず結果を一言だけ大きく出す。
 * いきなり明細を開くより、何が起きたのかが伝わる。
 */
function flashResult(res, next) {
  if (!res) { next(); return; }
  let label = '流局';
  let tone = 'draw';
  if (res.kind === 'win') {
    const mine = res.details.find((d) => d.seat === G.mySeat);
    const d = mine || res.details[0];
    label = d.tsumo ? 'ツモ' : 'ロン';
    tone = mine ? 'win' : 'lose';
    if (d.yakuman) { label = d.yakuman > 1 ? `${d.yakuman}倍役満` : '役満'; tone = 'yakuman'; }
  }
  floatPoints(res.deltas);
  // チップの増減も一緒に。前の局からの差を出す
  if (G.rules.bonus.enabled && Array.isArray(res.bonus)) {
    const before = G.lastBonus || res.bonus.map(() => 0);
    floatChips(res.bonus.map((v, i) => v - (before[i] || 0)));
    G.lastBonus = [...res.bonus];
  }
  const el = h(`div.flash.flash-${tone}`, h('span.flash-text', { text: label }));
  G.dom.toasts.parentElement.appendChild(el);
  const wait = tone === 'yakuman' ? 1500 : 850;
  G.timer = setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => { el.remove(); next(); }, 220);
  }, wait);
}

function showKyokuResult() {
  const e = G.engine;
  const res = e.kyokuEnd;
  const nameOf = (i) => e.players[i].name;
  // 局の結果だけ横持ちで2段組みにする（左に役、右に点数の動き）。
  // 印を付けずにいたころは、設定や対局終了の紙まで2段になり、
  // 左半分が空いたまま右に中身が寄っていた。
  const body = h('div.sheet-body.result-body');

  if (res.kind === 'win') {
    for (const d of res.details) {
      const rank = d.yakuman ? (d.yakuman > 1 ? `${d.yakuman}倍役満` : '役満')
        : (d.limitName || `${d.han}翻${G.rules.scoring.useFu ? ` ${d.fu}符` : ''}`);
      // 自分の和了は、ひと目で分かるように見せ方を変える
      const mine = d.seat === G.mySeat;
      body.appendChild(h(`div.win-head${mine ? '.is-me' : ''}`,
        h('div.win-rank', { text: rank }),
        h('div.grow',
          h('div.win-who', { text: `${nameOf(d.seat)} の ${d.tsumo ? 'ツモ' : 'ロン'}` }),
          d.gain > 0 ? h('div.win-gain', { text: `+${fmt(d.gain)}点` }) : null),
        mine ? h('img.win-art', { src: 'img/ui/win.png', alt: '' }) : null));
      body.appendChild(winHandView(d));
      // 役や内訳はひとまとめにする。横持ちでは左半分に置き、右半分に
      // 点数移動を並べるため、まとまりが1つの箱になっている必要がある。
      // 直に並べていたころは、点数移動が役の下に流れて画面外に出ていた。
      const detail = h('div.win-detail');
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
      detail.appendChild(list);
      if (d.substituted) {
        detail.appendChild(h('div.notice', {
          text: d.substituted.mighty
            ? `足りない1枚を ${d.substituted.to} として使いました（少牌マイティ）。`
            : `${d.substituted.from} をオールマイティとして ${d.substituted.to} の代わりに使用しました。`,
        }));
      }
      if (d.aliceFlips && d.aliceFlips.length) {
        detail.appendChild(h('div', { style: { margin: '10px 0' } },
          h('div.label', { text: `${d.aliceFlips[0].label} めくり` }),
          h('div.row.gap-8', d.aliceFlips.map((f) => h('div', { style: { textAlign: 'center' } },
            tileEl(f.tile, { size: 'sm', anim: 'flip' }),
            h('div.tiny', { class: f.matched ? '' : 'muted', text: f.matched ? '一致' : '不一致' }))))));
      }
      if (d.diceRolls && d.diceRolls.length) {
        detail.appendChild(diceView(d.diceRolls));
      }
      if (d.bonusDetail.length) {
        detail.appendChild(h('div.tiny.muted', { text: d.bonusDetail.join(' / ') }));
      }
      if (G.rules.bonus.enabled) {
        detail.appendChild(h('div.chip.chip-brass', { text: `${G.rules.bonus.label} ${signed(d.bonus)}` }));
      }
      body.appendChild(detail);
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
    // 自分の行はすぐ見つかるようにする。並びの中から名前を探すのは手間
    const mine = i === G.mySeat ? '.is-me' : '';
    table.appendChild(h(`dt${mine}`, { text: p.name }));
    table.appendChild(h(`dd${mine}`,
      h('span', { class: d >= 0 ? 'pt-plus' : 'pt-minus', text: signed(d) }),
      h('span.muted.tiny', { text: ` → ${fmt(p.points)}点` })));
  });
  body.appendChild(table);

  const next = h('button.btn.btn-brass', { text: e.finished ? '結果を見る' : '次の局へ' });
  next.addEventListener('click', () => {
    if (e.finished) { closeOverlay(); showFinal(); return; }
    // オンラインでは、次の局へ進むのも全員で足並みをそろえる。
    // 誰が押してもよく、先に届いた1回だけが効く。
    if (G.online) {
      next.disabled = true;
      next.textContent = '進めています…';
      sendAct(G.online.no, G.mySeat, { type: 'nextKyoku' });
      return;
    }
    closeOverlay();
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
    // 自分がどこにいるかは、順位表でいちばん知りたいところ
    const mine = f.seat === G.mySeat ? '.is-me' : '';
    list.appendChild(h(`div.mini-item${f.rank === 1 ? '.is-top' : ''}${mine}`,
      h('div.seat-wind', { text: String(f.rank) }),
      h('div.grow', h('div', { text: f.name }),
        h('div.tiny.muted', {
          text: `${fmt(f.points)}点`
            + (f.uma ? `　ウマ ${signed(f.uma)}` : '')
            + (f.kubi ? `　クビ ${signed(f.kubi)}` : ''),
        })),
      h('div', { style: { textAlign: 'right' } },
        h('div.num', { text: `${f.total > 0 ? '+' : ''}${f.total}` }),
        G.rules.bonus.enabled ? h('div.tiny', { class: 'muted', text: `${signed(f.bonus)}BP` }) : null)));
  }
  body.appendChild(list);
  if (G.rules.bonus.enabled) {
    body.appendChild(h('div.notice', { style: { marginTop: '14px' }, text: 'BPはゲーム内専用の非換金ポイントです。現金・景品との交換はありません。' }));
  }

  const again = h('button.btn.btn-brass', { text: 'もう一度遊ぶ' });
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
    b.addEventListener('click', () => {
      fn();
      // 手牌を入れ替えたら、選べる手も取り直す。
      // 取り直さないと、直前に計算した選択肢（暗槓など）が古いまま残る。
      if (G.waiting) G.waiting = { seat: G.waiting.seat, choices: G.engine.getChoices(G.waiting.seat) };
      drainLog();
      draw();
    });
    return b;
  };
  // 1種8枚あるルール（清一色ゲーム）で、5枚目以降の挙動を確かめる
  grid.appendChild(btn('同じ牌を5枚集める', () => {
    const n = G.engine.debugCollectSame(G.mySeat, 5);
    pushLog('rule', `［デバッグ］同じ牌を${n}枚に揃えました`);
  }));
  grid.appendChild(btn('同じ牌を6枚集める', () => {
    const n = G.engine.debugCollectSame(G.mySeat, 6);
    pushLog('rule', `［デバッグ］同じ牌を${n}枚に揃えました`);
  }));
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
  // 華牌を自分で抜くルールの確認用。ツモ待ちだと他家に流れてしまう
  grid.appendChild(btn('手牌に華牌を入れる', () => {
    const ok = G.engine.debugInjectToHand(G.mySeat, (t) => t.t >= 34);
    pushLog('rule', ok ? '［デバッグ］手牌に華牌を差し込み' : '［デバッグ］山に華牌がありません');
  }));
  grid.appendChild(btn('手牌をテンパイにする', () => {
    const ok = G.engine.debugMakeTenpai(0);
    pushLog('rule', ok ? '［デバッグ］手牌をテンパイ形に差し替えました' : '［デバッグ］山の残りが足りず作れませんでした');
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
