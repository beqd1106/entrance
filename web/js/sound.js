/**
 * sound.js - 対局の効果音
 *
 * 音の出どころは持たない。ファイルを配ると、その枚数ぶん読み込みが要るし、
 * 機内モードのために全部先に取っておく必要も出る。
 * ここでは Web Audio でその場で鳴らす。数十行で済み、増やしても重くならない。
 *
 * 音は「牌が卓に当たる音」を芯にしている。短い雑音＋低い胴鳴りで、
 * 打牌はコツン、ツモはやや軽く、鳴きは強く、和了は明るく。
 */
let ctx = null;
let on = true;

/** 端末が音を出せる状態か。最初の操作より前に作ると止められる決まりがある */
function audio() {
  if (!on) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch (e) {
    on = false;                 // 鳴らせない端末では黙って諦める
    return null;
  }
}

export function soundEnabled(v) {
  if (v !== undefined) on = !!v;
  return on;
}

/** 短い雑音。牌どうしが当たる「カッ」の芯になる */
function clack(c, t, { gain = 0.25, dur = 0.05, hz = 1800, q = 1.2 } = {}) {
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    // 後ろほど小さくして、余韻を残さない
    d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = hz; bp.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(bp).connect(g).connect(c.destination);
  src.start(t); src.stop(t + dur);
}

/** 澄んだ音。宣言や和了の合図に添える */
function tone(c, t, { hz = 660, gain = 0.16, dur = 0.18, type = 'triangle' } = {}) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(hz, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

/**
 * 効果音を鳴らす。
 * @param {'discard'|'draw'|'call'|'riichi'|'kan'|'win'|'lose'} kind
 */
export function play(kind) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  switch (kind) {
    case 'discard':                        // 卓に置くコツン
      clack(c, t, { gain: 0.28, hz: 1500, dur: 0.055 });
      break;
    case 'draw':                           // 山から取る、少し軽い音
      clack(c, t, { gain: 0.16, hz: 2400, dur: 0.035 });
      break;
    case 'call':                           // ポン・チーは強めに2つ
      clack(c, t, { gain: 0.3, hz: 1200, dur: 0.06 });
      clack(c, t + 0.075, { gain: 0.26, hz: 1500, dur: 0.05 });
      break;
    case 'kan':                            // カンは3つ重ねて厚く
      clack(c, t, { gain: 0.3, hz: 1100, dur: 0.06 });
      clack(c, t + 0.07, { gain: 0.28, hz: 1400, dur: 0.055 });
      clack(c, t + 0.14, { gain: 0.26, hz: 1700, dur: 0.05 });
      break;
    case 'riichi':                         // 棒を出す音＋澄んだ合図
      clack(c, t, { gain: 0.24, hz: 900, dur: 0.07 });
      tone(c, t + 0.04, { hz: 880, dur: 0.22 });
      break;
    case 'win':                            // 和了は明るく上がる
      tone(c, t, { hz: 660, dur: 0.16 });
      tone(c, t + 0.1, { hz: 880, dur: 0.18 });
      tone(c, t + 0.2, { hz: 1175, dur: 0.3 });
      break;
    case 'lose':                           // 他家の和了・流局は低く短く
      tone(c, t, { hz: 392, dur: 0.2, gain: 0.12 });
      break;
    default:
      break;
  }
}
