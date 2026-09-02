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
import { writeFileSync, mkdirSync } from 'node:fs';

const REPO = 'eoylab/keihyo-cases';
// The repo itself is `repos/owner/name`, not `repos/owner/name/` — a trailing
// slash 404s, which is how the first version of this failed.
const api = (path) => JSON.parse(execFileSync('gh',
  ['api', path === '' ? `repos/${REPO}` : `repos/${REPO}/${path}`], { encoding: 'utf8' }));

const today = new Date().toISOString().slice(0, 10);
const snapshot = {
  date: today,
  views: api('traffic/views'),
  clones: api('traffic/clones'),
  referrers: api('traffic/popular/referrers'),
  paths: api('traffic/popular/paths'),
};
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
console.log('  需要（使われるか）');
console.log(`    views     ${snapshot.views.count} (uniques ${t.uniqueViews})`);
console.log(`    clones    ${snapshot.clones.count} (uniques ${t.uniqueClones})`);
console.log(`    stars ${snapshot.stars}  forks ${snapshot.forks}  watchers ${snapshot.watchers}`);
console.log(`    referrers ${snapshot.referrers.map((r) => `${r.referrer}:${r.uniques}`).join(' ') || '(none)'}`);
console.log('\n  支払意思（金を払うか）');
console.log(`    commercial.html  uniques ${t.commercialPageUniques}`);
console.log(`    👍 合計 ${t.thumbsUp}   コメント ${t.commercialComments}`);
for (const i of snapshot.commercialInterest) {
  console.log(`      #${i.number} 👍${i.thumbsUp} 💬${i.comments}  ${i.title.split(' — ')[0].slice(0, 32)}`);
}
console.log('');
