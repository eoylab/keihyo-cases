// Packs the MCP server and its data into a single .mcpb bundle.
//
//   npm run build:mcpb
//
// The bundle exists for one reason: the official MCP Registry only lists
// servers whose package can be fetched from somewhere it recognises, and the
// options are npm, PyPI, NuGet, OCI or an MCPB artefact on a GitHub release.
// Every one of those except MCPB needs an account on a service nobody here has
// registered for, so MCPB is the path that reaches the registry using only the
// token that already pushes this repo.
//
// The layout inside the bundle mirrors the repository — src/mcp/server.mjs and
// data/cases.json — because the server resolves its data with a relative path
// and a flattened bundle would ship a server that cannot find its own data.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, utimesSync,
} from 'node:fs';
import { join } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const stage = 'build/mcpb';
rmSync('build', { recursive: true, force: true });
mkdirSync(`${stage}/src/mcp`, { recursive: true });
mkdirSync(`${stage}/data`, { recursive: true });

cpSync('src/mcp/server.mjs', `${stage}/src/mcp/server.mjs`);
cpSync('data/cases.json', `${stage}/data/cases.json`);
cpSync('README.md', `${stage}/README.md`);
cpSync('LICENSE', `${stage}/LICENSE`);
cpSync('DATA-LICENSE.md', `${stage}/DATA-LICENSE.md`);

const manifest = {
  manifest_version: '0.3',
  name: 'keihyo-cases',
  display_name: '景品表示法 措置命令・課徴金納付命令',
  version: pkg.version,
  description: pkg.description,
  long_description:
    '消費者庁が公表した景品表示法の措置命令・課徴金納付命令を、事業者名・条項・公表日で'
    + '検索できるデータセットと MCP サーバー。全件に出典URLがある。'
    + '**違反の判定はしない** — 各件は既に発出された処分の再記述であり、'
    + '「この表現は違反か」を判断する機能は含まない。'
    + '出典: 消費者庁ウェブサイト（公共データ利用規約 第1.0版に準拠）。',
  author: { name: 'keihyo-cases', url: 'https://github.com/eoylab/keihyo-cases' },
  homepage: 'https://eoylab.github.io/keihyo-cases/',
  documentation: 'https://github.com/eoylab/keihyo-cases#readme',
  repository: { type: 'git', url: 'https://github.com/eoylab/keihyo-cases.git' },
  license: 'MIT',
  keywords: pkg.keywords,
  server: {
    type: 'node',
    entry_point: 'src/mcp/server.mjs',
    mcp_config: { command: 'node', args: ['${__dirname}/src/mcp/server.mjs'] },
  },
  tools: [
    { name: 'search_cases', description: '事業者名・商品名・条項・期間で処分を検索する' },
    { name: 'get_case', description: '1件の処分を id で取得する' },
    { name: 'list_recent', description: '直近に公表された処分を新しい順に返す' },
    { name: 'stats', description: '件数・事業者数・期間・処分種別の内訳を返す' },
  ],
  // No user_config: the data ships inside the bundle and the server makes no
  // network calls, so there is nothing for the user to configure and no key to
  // ask for.
  compatibility: { runtimes: { node: '>=22' } },
};
writeFileSync(`${stage}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);

// Fixed timestamps on everything before zipping.
//
// The registry pins the artefact by SHA-256, and server.json carries that hash
// in the repository — so the hash committed here has to be the hash CI produces
// from the same tree, or the workflow publishes a manifest that does not match
// its own artefact. A zip stores each entry's mtime, and cpSync stamps the copy
// with the current time, so without this the bytes differ on every build and
// the committed hash would be wrong the moment CI ran. -X drops the platform
// attributes for the same reason.
const EPOCH = new Date('2026-01-01T00:00:00Z');
const stamp = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) stamp(full);
    utimesSync(full, EPOCH, EPOCH);
  }
  utimesSync(dir, EPOCH, EPOCH);
};
stamp(stage);

const out = 'build/keihyo-cases.mcpb';
execFileSync('zip', ['-q', '-r', '-X', '../keihyo-cases.mcpb', '.'], { cwd: stage });

const bytes = readFileSync(out);
const sha = createHash('sha256').update(bytes).digest('hex');
writeFileSync('build/keihyo-cases.mcpb.sha256', `${sha}\n`);

// The hash in server.json must describe the artefact the registry will fetch.
// Checked here rather than only in CI, so the mismatch surfaces at the moment
// the data changes instead of at the moment of publishing.
const server = JSON.parse(readFileSync('server.json', 'utf8'));
const declared = server.packages[0].fileSha256;

console.log(`${out}  ${bytes.length} bytes`);
console.log(`sha256   ${sha}`);
if (declared !== sha) {
  console.error(`\nserver.json の fileSha256 が一致しない:\n  宣言 ${declared}\n  実際 ${sha}`);
  console.error('server.json を更新してからタグを打つこと。');
  process.exit(1);
}
console.log('server.json の fileSha256 と一致');
