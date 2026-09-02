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

import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';

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

// The archive is written here rather than shelled out to `zip`.
//
// server.json commits the SHA-256 the registry pins the artefact by, so the
// hash produced on this machine has to be the hash CI produces from the same
// tree. `zip` did not give that: the macOS and Ubuntu builds came out the same
// length and different bytes, because the archive records the writing tool's
// own version and whatever order the directory happened to enumerate in.
//
// So: entries in sorted order, stored uncompressed, one fixed timestamp. No
// compression because a deflate stream is only identical across zlib versions
// by luck, and the whole bundle is 185KB — small enough that trading the
// compression for a hash that means something is not a trade at all.
const FILES = [
  'DATA-LICENSE.md',
  'LICENSE',
  'README.md',
  'data/cases.json',
  'manifest.json',
  'src/mcp/server.mjs',
].sort();
// 2026-01-01 00:00:00 in the DOS fields a zip uses (year counted from 1980).
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const locals = [];
const central = [];
let offset = 0;
for (const name of FILES) {
  const nameBytes = Buffer.from(name, 'utf8');
  const content = readFileSync(`${stage}/${name}`);
  const sum = crc32(content);

  const local = Buffer.alloc(30 + nameBytes.length);
  local.writeUInt32LE(0x04034b50, 0);   // local file header
  local.writeUInt16LE(20, 4);           // version needed
  local.writeUInt16LE(0x0800, 6);       // flags: names are UTF-8
  local.writeUInt16LE(0, 8);            // method 0 = stored
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(sum, 14);
  local.writeUInt32LE(content.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  local.writeUInt16LE(0, 28);           // no extra field
  nameBytes.copy(local, 30);
  locals.push(local, content);

  const entry = Buffer.alloc(46 + nameBytes.length);
  entry.writeUInt32LE(0x02014b50, 0);   // central directory header
  entry.writeUInt16LE(20, 4);           // version made by
  entry.writeUInt16LE(20, 6);           // version needed
  entry.writeUInt16LE(0x0800, 8);
  entry.writeUInt16LE(0, 10);
  entry.writeUInt16LE(DOS_TIME, 12);
  entry.writeUInt16LE(DOS_DATE, 14);
  entry.writeUInt32LE(sum, 16);
  entry.writeUInt32LE(content.length, 20);
  entry.writeUInt32LE(content.length, 24);
  entry.writeUInt16LE(nameBytes.length, 28);
  entry.writeUInt32LE(0, 30);           // extra + comment lengths
  entry.writeUInt16LE(0, 34);           // disk number
  entry.writeUInt16LE(0, 36);           // internal attributes
  // Unix mode in the high 16 bits. `<<` is a signed 32-bit operation in
  // JavaScript, so shifting 0o100644 that far makes it negative; multiplying
  // keeps it in the unsigned range writeUInt32LE accepts.
  entry.writeUInt32LE(0o100644 * 0x10000, 38); // regular file, rw-r--r--
  entry.writeUInt32LE(offset, 42);
  nameBytes.copy(entry, 46);
  central.push(entry);

  offset += local.length + content.length;
}
const directory = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);       // end of central directory
end.writeUInt16LE(FILES.length, 8);
end.writeUInt16LE(FILES.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);

const out = 'build/keihyo-cases.mcpb';
writeFileSync(out, Buffer.concat([...locals, directory, end]));

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
