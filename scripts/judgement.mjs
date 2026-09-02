// Opens the judgement issue when a pre-committed date arrives.
//
//   node scripts/judgement.mjs 14
//
// The point is that nobody has to remember. The dates for this experiment were
// fixed before any data existed (docs/DECISION.md), and an experiment whose
// judgement depends on a person recalling a date on the right day is an
// experiment that quietly runs forever.
//
// It runs daily and does nothing until the date has passed, so a skipped run
// costs nothing. It opens the issue once and then refuses to open it again.
//
// What it can and cannot read matters. The token GitHub Actions issues to a job
// reads issues, releases, stars and watchers — and is refused by the traffic
// endpoints (`Resource not accessible by integration`, measured). So traffic
// comes from the newest metrics/*.json a session committed, and the issue says
// how old that is rather than pretending it is current.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const REPO = process.env.GITHUB_REPOSITORY ?? 'eoylab/keihyo-cases';
const PUBLISHED = process.env.PUBLISHED_ON ?? '2026-09-02';
const days = Number(process.argv[2]);
if (!Number.isInteger(days)) throw new Error('日数を渡すこと: node scripts/judgement.mjs 14');

const gh = (args) => execFileSync('gh', args, { encoding: 'utf8' });
// `repos/owner/name/` with a trailing slash is a 404, which is how the first
// version of metrics.mjs failed and how this one failed too. The repo itself is
// the bare path.
const api = (path) => JSON.parse(gh(['api', path === '' ? `repos/${REPO}` : `repos/${REPO}/${path}`]));

const due = new Date(Date.parse(PUBLISHED) + days * 86400000).toISOString().slice(0, 10);
const today = new Date().toISOString().slice(0, 10);
if (today < due) {
  console.log(`${days}日判定はまだ: ${due}（今日 ${today}）`);
  process.exit(0);
}

const MARKER = `<!-- judgement:${days} -->`;
const existing = api('issues?state=all&per_page=100&labels=judgement');
if (existing.some((issue) => (issue.body ?? '').includes(MARKER))) {
  console.log(`${days}日判定はすでに出している`);
  process.exit(0);
}

// --- What the Actions token can read -----------------------------------------
const repo = api('');
const interest = api('issues?labels=commercial-interest&state=all&per_page=100');
const releases = api('releases?per_page=100');
const downloads = releases.flatMap((r) => r.assets.map((a) => a.download_count))
  .reduce((n, c) => n + c, 0);
const thumbsUp = interest.reduce((n, i) => n + i.reactions['+1'], 0);
const comments = interest.reduce((n, i) => n + i.comments, 0);

// --- What only a session could collect ---------------------------------------
let traffic = null;
if (existsSync('metrics')) {
  const files = readdirSync('metrics').filter((f) => f.endsWith('.json')).sort();
  if (files.length > 0) {
    const latest = files.at(-1);
    traffic = { file: latest, ...JSON.parse(readFileSync(`metrics/${latest}`, 'utf8')) };
    traffic.ageDays = Math.round((Date.parse(today) - Date.parse(latest.replace('.json', ''))) / 86400000);
  }
}

const line = (label, value) => `| ${label} | ${value} |`;
const cta = traffic?.ctaClicks ?? [];
const unobservable = cta.filter((c) => c.observable === false).map((c) => c.tier);
const observedClicks = cta.filter((c) => c.observable !== false).reduce((n, c) => n + (c.views ?? 0), 0);

const body = `${MARKER}
**公開から${days}日。判定の期日です。** 基準は観測より前に
[docs/DECISION.md](https://github.com/${REPO}/blob/main/docs/DECISION.md) に固定してあります。

このIssueは期日に自動で立ちます。**誰かが日付を覚えている必要をなくすため**です。

## Actions のトークンで読めたもの

| 指標 | 値 |
|---|---|
${line('👍 合計（価格つき Issue）', thumbsUp)}
${line('コメント合計', comments)}
${line('watchers', repo.subscribers_count)}
${line('stars', repo.stargazers_count)}
${line('Release ダウンロード合計', downloads)}

## セッションが集めた traffic

${traffic === null ? '**まだ一度も記録されていない。**' : `\
最新のスナップショット \`metrics/${traffic.file}\`（**${traffic.ageDays}日前**）

| 指標 | 値 |
|---|---|
${line('unique views', traffic.totals?.uniqueViews ?? '—')}
${line('unique clones', traffic.totals?.uniqueClones ?? '—')}
${line('観測できた CTA クリック', observedClicks)}
${unobservable.length > 0
  ? line('**測定不能な tier**', `**${unobservable.join(' ')}** — 上位10パスの外。**0 と読まないこと**`)
  : line('測定不能な tier', 'なし（不在＝0 と読める）')}

${traffic.ageDays > 14
  ? '⚠ **14日より古い。** GitHub は traffic を14日しか保持しないので、その間の日別データは失われている。'
  : ''}`}

traffic API は Actions のトークンを受け付けない（\`Resource not accessible by integration\`）ので、
上の数字は**セッションが \`npm run metrics\` を走らせた時点のもの**です。

## やること

1. \`npm run metrics\` を走らせて最新化する
2. **docs/DECISION.md の基準をそのまま当てる。** 基準を作り直さない
3. ${unobservable.length > 0
  ? '**測定不能な tier があるので、クリック数による判定は保留する。** 👍・コメント・watchers・Release DL で判断する'
  : '判定して、結論と判定日を記録する'}
4. 結論を naoshidoki の \`docs/SCHEDULED-WORK.md\` の「済んだもの」へ移す

**基準を後から緩めないこと。** データが出てから基準を作れば、どんな結果でも続ける理由が書けます。
`;

gh(['issue', 'create', '--repo', REPO, '--label', 'judgement',
  '--title', `${days}日判定（公開 ${PUBLISHED} → 期日 ${due}）`, '--body', body]);
console.log(`${days}日判定の Issue を作成した`);
