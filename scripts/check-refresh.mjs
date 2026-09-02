// Refuses a refreshed dataset that looks like a scrape that broke rather than
// a month that happened.
//
//   node scripts/check-refresh.mjs <previous-meta.json>
//
// This exists because the monthly refresh publishes to a public registry
// without anyone reading the diff. The Consumer Affairs Agency can change its
// page markup at any time, and a deterministic extractor that suddenly matches
// nothing does not error — it produces a smaller, emptier, perfectly valid
// file. Losing cases is the failure mode that looks like success.

import { readFileSync } from 'node:fs';

const previous = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const meta = JSON.parse(readFileSync('data/meta.json', 'utf8'));
const cases = JSON.parse(readFileSync('data/cases.json', 'utf8'));

const problems = [];

// Orders already published are not withdrawn, so the count only goes up. A
// drop means the extractor stopped finding things, not that the agency undid a
// decision.
if (meta.case_count < previous.case_count) {
  problems.push(`件数が減った: ${previous.case_count} → ${meta.case_count}`);
}
if (cases.length !== meta.case_count) {
  problems.push(`meta と実データが食い違う: ${meta.case_count} / ${cases.length}`);
}
// A month that adds a hundred cases is a duplicate-id bug, not a busy month:
// the agency publishes single digits to low teens per month.
if (meta.case_count > previous.case_count + 40) {
  problems.push(`増えすぎ: +${meta.case_count - previous.case_count}（重複の可能性）`);
}
// If parsing degrades, the failures pile up here rather than in cases.json.
if (meta.unparsed_count > previous.unparsed_count + 20) {
  problems.push(`抽出できない件数が急増: ${previous.unparsed_count} → ${meta.unparsed_count}`);
}

const REQUIRED = ['id', 'title', 'company', 'order_type', 'published_date', 'lead_text', 'url', 'source'];
for (const record of cases) {
  const missing = REQUIRED.filter((key) => record[key] === null || record[key] === undefined || record[key] === '');
  if (missing.length > 0) {
    problems.push(`必須項目が欠けている ${record.id ?? '(id なし)'}: ${missing.join(', ')}`);
    break;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.published_date)) {
    problems.push(`公表日の書式が不正 ${record.id}: ${record.published_date}`);
    break;
  }
  if (!record.url.startsWith('https://www.caa.go.jp/')) {
    problems.push(`出典URLが消費者庁でない ${record.id}: ${record.url}`);
    break;
  }
}
const ids = new Set(cases.map((c) => c.id));
if (ids.size !== cases.length) problems.push(`id が重複している: ${cases.length - ids.size} 件`);

if (problems.length > 0) {
  console.error('refresh を中止する:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`refresh OK — ${previous.case_count} → ${meta.case_count} 件 / 未抽出 ${meta.unparsed_count} 件`);
