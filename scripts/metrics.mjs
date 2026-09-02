// Snapshots what this venture can actually measure, because GitHub only keeps
// 14 days of traffic.
//
//   npm run metrics
//
// This is the whole measurement apparatus. It needs no account anyone has to
// create and no service anyone has to pay for — the token that pushes the code
// also reads the traffic.
//
// Two different questions are being measured, and they are not the same:
//
//   clones / views / referrers  → does anyone WANT this
//   commercial-interest issues  → would anyone PAY for the part that costs us
//
// A clone is free to the person cloning, so no number of clones tells us
// anything about revenue. The issues carry named prices, so a 👍 there is a
// hand raised against a price rather than against a free thing.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';

const REPO = 'eoylab/keihyo-cases';
// The repo itself is `repos/owner/name`, not `repos/owner/name/` — a trailing
// slash 404s, which is how the first version of this failed.
const api = (path) => JSON.parse(execFileSync('gh',
  ['api', path === '' ? `repos/${REPO}` : `repos/${REPO}/${path}`], { encoding: 'utf8' }));

// Why this is not a scheduled workflow: the traffic endpoints refuse the token
// GitHub Actions issues to a job ("Resource not accessible by integration"),
// and the alternative — storing a user token with repo-wide scope as a secret
// on a public repository — buys a cron at the price of a much larger blast
// radius. It is not worth that.
//
// It does not need a cron either. Each call returns the full fourteen-day
// series day by day, not just a total, so one run at any point inside a window
// captures the whole window. The only thing lost is history older than
// fourteen days, so the rule is simply: run this at least once a fortnight.
// The warning below exists so a gap is visible instead of silent.
const today = new Date().toISOString().slice(0, 10);
const previous = existsSync('metrics')
  ? readdirSync('metrics').filter((f) => f.endsWith('.json')).sort().at(-1)
  : undefined;
const gapDays = previous === undefined ? null
  : Math.round((Date.parse(today) - Date.parse(previous.replace('.json', ''))) / 86400000);
const snapshot = {
  date: today,
  views: api('traffic/views'),
  clones: api('traffic/clones'),
  referrers: api('traffic/popular/referrers'),
  paths: api('traffic/popular/paths'),
};
// Installs through the MCP Registry never touch `git clone` — the client
// fetches the .mcpb straight off the release. So the asset's download count is
// a separate arrival path from clones, and reading only clones would score a
// registry install as no interest at all.
snapshot.releaseDownloads = api('releases?per_page=100').flatMap((release) =>
  release.assets.map((asset) => ({
    tag: release.tag_name, name: asset.name, downloads: asset.download_count,
  })));

const repo = api('');
snapshot.stars = repo.stargazers_count;
snapshot.forks = repo.forks_count;
snapshot.watchers = repo.subscribers_count;

// --- Willingness to pay ------------------------------------------------------
// Each issue is one paid option with a price printed on it. Reactions and
// comments are recorded separately: a 👍 is cheap, a comment stating a use case
// and a volume is not, so they are not summed into one number.
const issues = api('issues?labels=commercial-interest&state=all&per_page=100');
snapshot.commercialInterest = issues.map((issue) => ({
  number: issue.number,
  title: issue.title,
  thumbsUp: issue.reactions['+1'],
  reactionsTotal: issue.reactions.total_count,
  comments: issue.comments,
})).sort((a, b) => a.number - b.number);

// Views of the page that explains the paid options. Reaching it means clicking
// past the free dataset, which is a weaker signal than a 👍 but a much larger
// sample, and it needs no GitHub account — so it catches the buyer who is not
// the developer.
const commercialPage = snapshot.paths.find((p) => p.path.endsWith('/commercial.html'));
snapshot.commercialPageViews = commercialPage
  ? { count: commercialPage.count, uniques: commercialPage.uniques }
  : { count: 0, uniques: 0 };

snapshot.totals = {
  uniqueClones: snapshot.clones.uniques,
  mcpbDownloads: snapshot.releaseDownloads.reduce((n, a) => n + a.downloads, 0),
  uniqueViews: snapshot.views.uniques,
  thumbsUp: snapshot.commercialInterest.reduce((n, i) => n + i.thumbsUp, 0),
  commercialComments: snapshot.commercialInterest.reduce((n, i) => n + i.comments, 0),
  commercialPageUniques: snapshot.commercialPageViews.uniques,
};

mkdirSync('metrics', { recursive: true });
const file = `metrics/${today}.json`;
writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);

const t = snapshot.totals;
console.log(`${file}\n`);
if (gapDays !== null && gapDays > 14) {
  console.log(`  ⚠ 前回のスナップショットから ${gapDays} 日。`
    + `GitHub は14日しか保持しないので、その間の日別データは失われている\n`);
}
console.log('  需要（使われるか）');
console.log(`    views     ${snapshot.views.count} (uniques ${t.uniqueViews})`);
console.log(`    clones    ${snapshot.clones.count} (uniques ${t.uniqueClones})`);
console.log(`    .mcpb DL  ${t.mcpbDownloads}  ← MCP Registry 経由の導入はここに出る（clone には出ない）`);
console.log(`    stars ${snapshot.stars}  forks ${snapshot.forks}  watchers ${snapshot.watchers}`);
console.log(`    referrers ${snapshot.referrers.map((r) => `${r.referrer}:${r.uniques}`).join(' ') || '(none)'}`);
console.log('\n  支払意思（金を払うか）');
console.log(`    commercial.html  uniques ${t.commercialPageUniques}`);
console.log(`    👍 合計 ${t.thumbsUp}   コメント ${t.commercialComments}`);
for (const i of snapshot.commercialInterest) {
  console.log(`      #${i.number} 👍${i.thumbsUp} 💬${i.comments}  ${i.title.split(' — ')[0].slice(0, 32)}`);
}
console.log('');
