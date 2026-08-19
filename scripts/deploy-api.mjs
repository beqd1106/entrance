/**
 * deploy-api.mjs - server/ を Lambda へ反映する
 *
 *   node scripts/deploy-api.mjs
 *
 * 手作業のアップロードにすると、誰が何を上げたのか分からなくなる。
 * コードは常に server/ を正とし、この1本で置き換える。
 * 依存は Node 標準と AWS CLI だけ（追加のパッケージを持ち込まない）。
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = process.env.FN_NAME || 'houserule-api';
const REGION = process.env.AWS_REGION || 'ap-northeast-1';

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

const work = mkdtempSync(join(tmpdir(), 'houserule-api-'));
try {
  cpSync(join(ROOT, 'server'), work, { recursive: true });

  // PowerShell の Compress-Archive は Windows/CI どちらでも使える
  const zip = join(work, '..', `${FN}.zip`);
  rmSync(zip, { force: true });
  run('powershell', ['-NoProfile', '-Command',
    `Compress-Archive -Path '${work}\\*' -DestinationPath '${zip}' -Force`]);

  const out = run('aws', [
    'lambda', 'update-function-code',
    '--function-name', FN,
    '--zip-file', `fileb://${zip}`,
    '--region', REGION,
    '--query', 'LastUpdateStatus', '--output', 'text',
  ]);
  console.log(`${FN}: ${out.trim()}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
