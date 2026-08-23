/**
 * online.js - オンライン対局の待合室
 *
 * 部屋を作る／番号で入る、の2つだけ。
 * 席が埋まらなくてもAIが入るので、2人でもすぐ打てる。
 *
 * 通信するのは「人の操作」だけにしている。
 * AIの手は乱数を使わない決まった手順で決まるので、
 * どの端末で計算しても同じ手になる。だから配る必要がない。
 *
 * 詳しくは docs/11_オンライン対戦.md を参照。
 */
import { h, clear, sectionHead, chip, field } from './ui.js';
import { ALL_PRESETS } from '../../src/rules/presets.js';
import { loadCustomPresets, lookupPreset } from './custom.js';
import {
  hasOnline, connect, disconnect, onMessage, status,
  createRoom, joinRoom, startRoom, playerName, savePlayerName,
} from './net.js';

/**
 * 部屋が持ってきた自作ルール。
 * サーバは中身を文字のまま預かるので、ここで組み直す。
 * 読めなければ null を返し、プリセット名で打つ（黙って壊れた設定を使わない）。
 */
function parsePatch(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

/** 開始が決まった卓。game.js がここから受け取る */
let table = null;
export function currentTable() { return table; }
export function clearTable() { table = null; }

export function renderOnline(root, params) {
  clear(root);
  const sec = h('section.section', h('div.wrap-narrow'));
  const wrap = sec.firstChild;
  root.appendChild(sec);

  if (!hasOnline()) {
    wrap.appendChild(sectionHead('01', 'オンラインで打つ', 'いまは準備中です。'));
    wrap.appendChild(h('div.notice', { text: 'この配布ではオンライン対局を無効にしています。ひとりで打つ卓は今までどおり使えます。' }));
    wrap.appendChild(h('div', { style: { marginTop: '16px' } },
      h('a.btn.btn-primary', { href: '#/table', text: 'ひとりで卓を立てる' })));
    return () => {};
  }

  let room = null;
  let mySeat = null;
  const body = h('div');
  wrap.appendChild(sectionHead('01', 'オンラインで打つ', '同じハウスルールを、離れた相手と一緒に打てます。'));
  wrap.appendChild(body);
  wrap.appendChild(h('p.tiny.muted', { style: { marginTop: '20px' },
    text: '見知らぬ相手との競技ではなく、友人同士や店内での卓を想定した作りです。' }));

  const off = onMessage((msg) => {
    if (msg.type === '_state') { if (!room) drawLobby(); return; }
    if (msg.type === 'error') { drawLobby(msg.message); return; }
    if (msg.type === 'room') {
      room = msg.room;
      if (typeof msg.you === 'number') mySeat = msg.you;
      drawRoom();
      return;
    }
    if (msg.type === 'begin') {
      room = msg.room;
      // 戻ってきたときは席が新しく割り当てられる
      if (typeof msg.you === 'number') mySeat = msg.you;
      table = {
        no: room.no, seat: mySeat, seed: room.seed, host: room.host,
        presetId: room.presetId, rulesPatch: parsePatch(room.rulesPatch),
        seats: room.seats,
        // 途中から戻った卓は、これまでの手を配り直してもらって追いつく
        rejoin: !!msg.rejoin, actionCount: room.actionCount || 0,
      };
      location.hash = `#/play?preset=${encodeURIComponent(room.presetId)}&room=${room.no}`;
    }
  });
  connect();
  drawLobby();

  // --- 待合室（部屋に入る前）
  function drawLobby(errorText) {
    clear(body);
    const name = h('input', { type: 'text', value: playerName(), placeholder: 'ニックネーム', maxlength: '12' });
    name.addEventListener('input', () => savePlayerName(name.value));

    const presets = [...ALL_PRESETS, ...loadCustomPresets()];
    const sel = h('select');
    for (const p of presets) sel.appendChild(h('option', { value: p.id, text: p.name }));
    if (params.preset) sel.value = params.preset;

    const make = h('button.btn.btn-primary', { text: '部屋を作る' });
    make.addEventListener('click', () => {
      const preset = lookupPreset(sel.value);
      // 自作ルールは相手の端末には無い。中身をそのまま部屋に持っていかないと、
      // 相手だけ既定のルールで打つことになり、局面がずれる。
      const isCustom = loadCustomPresets().some((p) => p.id === sel.value);
      createRoom({
        presetId: sel.value,
        rulesPatch: isCustom ? preset.rules : null,
        n: (preset.rules && preset.rules.game && preset.rules.game.players) === 3 ? 3 : 4,
        name: name.value.trim(),
      });
      make.disabled = true;
      make.textContent = '作っています…';
    });

    const no = h('input', {
      type: 'text', inputmode: 'numeric', maxlength: '4',
      placeholder: '0000', style: { maxWidth: '120px', letterSpacing: '.2em', fontSize: '20px' },
    });
    const join = h('button.btn.btn-brass', { text: '入る' });
    const doJoin = () => {
      if (!no.value.trim()) return;
      joinRoom(no.value.trim(), name.value.trim());
      join.disabled = true;
      join.textContent = '入っています…';
    };
    join.addEventListener('click', doJoin);
    no.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

    if (errorText) body.appendChild(h('div.issue.issue-warn', h('div', h('b', { text: '入れませんでした' }), h('span', { text: errorText }))));
    body.appendChild(h('div.card.card-pad', { style: { marginBottom: '14px' } },
      field('名前', name, '卓に出る名前です。あとから変えられます。')));
    body.appendChild(h('div.online-grid',
      h('div.card.card-pad',
        h('h3', { style: { fontSize: '16px', marginBottom: '4px' }, text: '部屋を作る' }),
        h('p.tiny.muted', { text: 'ルールを選ぶと部屋番号が出ます。相手にその番号を伝えてください。' }),
        h('div', { style: { margin: '10px 0' } }, sel),
        make),
      h('div.card.card-pad',
        h('h3', { style: { fontSize: '16px', marginBottom: '4px' }, text: '部屋に入る' }),
        h('p.tiny.muted', { text: '教えてもらった4桁の番号を入れてください。通信が切れて抜けてしまったときも、同じ番号で戻れます。' }),
        h('div.row.gap-8', { style: { margin: '10px 0' } }, no, join))));
    body.appendChild(h('p.tiny.muted', { style: { marginTop: '12px' },
      text: status() === 'open' ? '接続しています。' : 'サーバにつないでいます…' }));
  }

  // --- 部屋のなか（席が埋まるのを待つ）
  function drawRoom() {
    clear(body);
    const preset = lookupPreset(room.presetId);
    const isHost = mySeat === room.host;
    const humans = room.seats.filter((s) => s.name && !s.cpu).length;

    body.appendChild(h('div.card.card-pad', { style: { marginBottom: '14px' } },
      h('div.tiny.muted', { text: '部屋番号' }),
      h('div.room-no', { text: room.no }),
      h('p.tiny.muted', { style: { margin: 0 }, text: 'この番号を相手に伝えてください。' })));

    body.appendChild(h('div.row.gap-8.wrapflex', { style: { marginBottom: '12px' } },
      chip(preset.name), chip(`${room.n}人打ち`)));

    const list = h('div.seat-list');
    room.seats.forEach((s) => {
      const label = s.name || '空席';
      list.appendChild(h('div.seat-row' + (s.seat === mySeat ? '.is-me' : ''),
        h('span.seat-no', { text: `${s.seat + 1}` }),
        h('span.grow', { text: label }),
        s.seat === mySeat ? chip('あなた', 'brass')
          : s.name ? h('span.tiny.muted', { text: s.connected ? '準備OK' : '接続待ち' })
            : h('span.tiny.muted', { text: '開始するとAIが入ります' })));
    });
    body.appendChild(list);

    if (isHost) {
      const go = h('button.btn.btn-primary.btn-lg', { style: { marginTop: '14px' }, text: '開始する' });
      go.addEventListener('click', () => { startRoom(room.no); go.disabled = true; go.textContent = '始めています…'; });
      body.appendChild(go);
      body.appendChild(h('p.tiny.muted', { style: { marginTop: '8px' },
        text: humans < room.n ? '空いている席はAIが入ります。相手を待たずに始められます。' : '全員そろいました。' }));
    } else {
      body.appendChild(h('p.tiny.muted', { style: { marginTop: '14px' },
        text: '部屋を作った人が開始するのを待っています。' }));
    }
  }

  return () => {
    off();
    // 対局へ進むときは接続を保つ。待合室から離れるだけなら切る。
    if (!table) disconnect();
  };
}
