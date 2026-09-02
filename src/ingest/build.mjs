// Builds the dataset from the agency's own year indexes.
//
//   node src/ingest/build.mjs            2020..current
//   node src/ingest/build.mjs 2024 2026  a range
//
// One request per second with a contactable user agent. The agency's robots.txt
// disallows only /service-by-publication/assets/, and its terms place the pages
// under 公共データ利用規約 (PDL1.0): reuse is allowed with attribution, and edits
// must be declared. Both are recorded in every record and in DATA-LICENSE.md.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { extractCase } from './extract.mjs';

const UA = 'keihyo-cases dataset builder (+https://github.com/eoylab/keihyo-cases)';
const BASE = 'https://www.caa.go.jp';
const INDEX = (year) => `${BASE}/policies/policy/representation/fair_labeling/release/${year}/`;

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function get(url) {
  const response = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

/** The entry ids an index page links to, in the order the agency lists them. */
function entryIds(html) {
  const found = [...html.matchAll(/href="\/notice\/entry\/(\d+)\/"/g)].map((m) => m[1]);
  return [...new Set(found)];
}

const from = Number(process.argv[2] ?? 2020);
const to = Number(process.argv[3] ?? new Date().getFullYear());

const cases = [];
const unparsed = [];

for (let year = from; year <= to; year += 1) {
  let index;
  try {
    index = await get(INDEX(year));
  } catch (error) {
    // A year with no index is normal at the edges of the range; a year that
    // errors for another reason is recorded rather than swallowed.
    console.log(`  ${year}: 索引を取得できず (${error.message})`);
    await sleep(1000);
    continue;
  }
  const ids = entryIds(index);
  console.log(`  ${year}: ${ids.length} 件`);
  await sleep(1000);

  for (const id of ids) {
    const url = `${BASE}/notice/entry/${id}/`;
    try {
      const { record, missing } = extractCase(await get(url), { url, id, fiscalYear: year });
      // 景品表示法 indexes also carry unrelated releases (guidance, statistics).
      // The order type is what separates an enforcement action from an
      // announcement, and it comes from the agency's own title.
      if (record.order_type === null) {
        unparsed.push({ id, url, fiscal_year: year, reason: '処分ではない（措置命令・課徴金納付命令の記載なし）', title: record.title });
      } else if (missing.length > 0) {
        unparsed.push({ id, url, fiscal_year: year, reason: `欠損: ${missing.join(', ')}`, title: record.title });
      } else {
        cases.push(record);
      }
    } catch (error) {
      unparsed.push({ id, url, fiscal_year: year, reason: error.message });
    }
    await sleep(1000);
  }
}

cases.sort((a, b) => (a.published_date < b.published_date ? 1 : -1));

mkdirSync('data', { recursive: true });
writeFileSync('data/cases.json', `${JSON.stringify(cases, null, 2)}\n`);
writeFileSync('data/cases.jsonl', `${cases.map((c) => JSON.stringify(c)).join('\n')}\n`);

const csvCell = (value) => {
  const text = value === null || value === undefined ? ''
    : Array.isArray(value) ? value.join(' / ')
    : typeof value === 'object' ? value.name
    : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};
const columns = ['id', 'published_date', 'company', 'order_type', 'provisions', 'product', 'title', 'url', 'pdf_url', 'fiscal_year'];
writeFileSync('data/cases.csv',
  `${[columns.join(','), ...cases.map((c) => columns.map((k) => csvCell(c[k])).join(','))].join('\n')}\n`);

writeFileSync('data/unparsed.json', `${JSON.stringify(unparsed, null, 2)}\n`);
writeFileSync('data/meta.json', `${JSON.stringify({
  built_from: `${from}..${to}`,
  case_count: cases.length,
  unparsed_count: unparsed.length,
  source: '出典: 消費者庁ウェブサイト',
  source_index: INDEX('{fiscal_year}'),
  licence: '公共データ利用規約(第1.0版) / PDL1.0',
  processing: '索引と個別ページから決定論的に抽出・構造化したもの。文言の改変はしていない',
}, null, 2)}\n`);

console.log(`\n  cases: ${cases.length} / unparsed: ${unparsed.length}`);
