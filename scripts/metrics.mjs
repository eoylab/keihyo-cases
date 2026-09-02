// Snapshots the repository's traffic, because GitHub only keeps 14 days of it.
//
//   npm run metrics
//
// This is the whole measurement apparatus for this venture. It needs no account
// anyone has to create and no service anyone has to pay for — the token that
// pushes the code also reads the traffic. Clones matter more than views: a view
// is someone reading the README, a clone is someone putting the data somewhere.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';

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

mkdirSync('metrics', { recursive: true });
const file = `metrics/${today}.json`;
writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);

console.log(`${file}`);
console.log(`  views   ${snapshot.views.count} (uniques ${snapshot.views.uniques})`);
console.log(`  clones  ${snapshot.clones.count} (uniques ${snapshot.clones.uniques})`);
console.log(`  stars   ${snapshot.stars}   forks ${snapshot.forks}`);
console.log(`  referrers ${snapshot.referrers.map((r) => `${r.referrer}:${r.uniques}`).join(' ') || '(none)'}`);
