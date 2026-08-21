/**
 * gen-image.mjs - Gemini の画像生成APIを直接叩いて画像を作る
 *
 * なぜ自前で叩くか：
 *   MCP（@rlabs-inc/gemini-mcp 0.8.1）は `gemini-3-pro-image-preview` 固定で、
 *   このモデルが混んでいると 503（high demand）で必ず失敗する。
 *   `gemini-3.1-flash-image` や `gemini-2.5-flash-image` は同じキーで通るので、
 *   モデルを選べる入口をこちらに持っておく。
 *
 * 使い方:
 *   GEMINI_API_KEY=... node scripts/gen-image.mjs --out web/img/op-bg.png \
 *     --aspect 16:9 --model gemini-3.1-flash-image --prompt "..."
 *   （--prompt-file でファイルからも渡せる）
 *
 * 鍵はリポジトリに置かない。環境変数から読む。
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
function arg(name, fallback = null) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error('GEMINI_API_KEY が未設定です。');
  process.exit(1);
}

const model = arg('model', 'gemini-3.1-flash-image');
const aspect = arg('aspect', '16:9');
const out = arg('out', 'out.png');
const promptFile = arg('prompt-file');
const prompt = promptFile ? fs.readFileSync(promptFile, 'utf8') : arg('prompt');
if (!prompt) {
  console.error('--prompt か --prompt-file が要ります。');
  process.exit(1);
}

const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
const body = {
  contents: [{ parts: [{ text: prompt }] }],
  generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } },
};

const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

if (!res.ok) {
  const text = await res.text();
  console.error(`[${model}] HTTP ${res.status}: ${text.slice(0, 400)}`);
  process.exit(1);
}

const json = await res.json();
const parts = json?.candidates?.[0]?.content?.parts || [];
const image = parts.find((p) => p.inlineData?.data);
if (!image) {
  console.error('画像が返りませんでした:', JSON.stringify(json).slice(0, 400));
  process.exit(1);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
const buf = Buffer.from(image.inlineData.data, 'base64');
fs.writeFileSync(out, buf);
console.log(`${out} に保存しました（${(buf.length / 1024).toFixed(0)} KB / ${model} / ${aspect}）`);
