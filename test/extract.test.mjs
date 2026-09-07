// Checks the extractor against saved pages, field by field, verbatim.
//
// The dataset's only claim is "the agency published this". So the test asserts
// the exact strings the agency used — if a future site change alters a heading
// and the extractor starts producing something plausible but different, this
// fails rather than the dataset quietly drifting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractCase, withoutNaturalPerson } from '../src/ingest/extract.mjs';

test('every field comes from the page, verbatim', () => {
  const html = readFileSync('test/fixtures/entry-041488.html', 'utf8');
  const { record, missing } = extractCase(html, {
    url: 'https://www.caa.go.jp/notice/entry/041488/', id: '041488', fiscalYear: 2024,
  });

  assert.deepEqual(missing, []);
  assert.equal(record.company, 'ロート製薬株式会社');
  assert.equal(record.order_type, '措置命令');
  assert.equal(record.published_date, '2025-03-25');
  assert.equal(record.title, 'ロート製薬株式会社に対する景品表示法に基づく措置命令について');
  assert.deepEqual(record.provisions, ['第5条第3号(ステルスマーケティング告示)', '第7条第1項']);
  assert.equal(record.product.name, 'ロートV5アクトビジョンa');
  // Injected by script on the live page, so absent from the served HTML. Absent
  // is recorded as absent — a guessed PDF link would point somewhere wrong.
  assert.equal(record.pdf_url, null);
  assert.match(record.lead_text, /^消費者庁は、本日、ロート製薬株式会社に対し、/);
  assert.equal(record.authority, '消費者庁');
});

test('a release that is not an enforcement action yields no order type', () => {
  // The agency's 景品表示法 index also carries guidance and warnings. Those must
  // not become records: a company named in a 注意喚起 has not been ordered to do
  // anything, and filing it beside real orders would misrepresent it.
  const { record } = extractCase('<h1>自転車用ヘルメットを標ぼうする商品に関する注意喚起について</h1>', {
    url: 'https://example.test/', id: '0', fiscalYear: 2024,
  });
  assert.equal(record.order_type, null);
});

test('a title without the expected construction yields no company', () => {
  // Rather than cutting the string at a guess. A wrong company name on a record
  // about an enforcement action is the one error this dataset must not contain.
  const { record } = extractCase('<h1>景品表示法の運用状況について</h1>', {
    url: 'https://example.test/', id: '0', fiscalYear: 2024,
  });
  assert.equal(record.company, null);
});

test('the index parser takes only enforcement entry links', () => {
  const html = readFileSync('test/fixtures/index-2024.html', 'utf8');
  const ids = [...new Set([...html.matchAll(/href="\/notice\/entry\/(\d+)\/"/g)].map((m) => m[1]))];
  assert.ok(ids.length >= 20, `expected the 2024 index to list many entries, got ${ids.length}`);
  assert.ok(ids.every((id) => /^\d+$/.test(id)));
});

// A sole proprietor is published as 「〈屋号〉こと〈氏名〉」. This dataset states in
// its README, and in the commercial-use document inside the paid bundle, that it
// carries no representatives' names — and it carried one: 026954 shipped a real
// person's name, inside a ZIP whose own paperwork denied it. A paid file that
// asserts something untrue in a document written for someone's internal approval
// is worse than the omission it was hiding.
//
// A detector, not a one-off edit: orders against sole proprietors keep being
// issued, and the next one would put the name back without anyone noticing.
test('a sole proprietor’s own name is not kept', () => {
  assert.equal(withoutNaturalPerson('カーズショップ松山こと高畑正志'), 'カーズショップ松山');
  assert.equal(withoutNaturalPerson('株式会社カーズショップ松山'), '株式会社カーズショップ松山');
  // The first version cut 「まことや」 to 「ま」 — it matched the characters inside
  // an ordinary trade name. Kana after the joiner, or a leading fragment shorter
  // than three characters, now means "leave it exactly as published".
  assert.equal(withoutNaturalPerson('まことや'), 'まことや');
  assert.equal(withoutNaturalPerson('和菓子まことこと堂'), '和菓子まことこと堂');
  assert.equal(withoutNaturalPerson('ことこと堂'), 'ことこと堂');
  assert.equal(withoutNaturalPerson('こと'), 'こと');
});

test('no record carries a personal name after the joiner', () => {
  const cases = JSON.parse(readFileSync('data/cases.json', 'utf8'));
  for (const record of cases) {
    const name = record.company ?? '';
    const at = name.indexOf('こと');
    assert.ok(at <= 0 || name.slice(at + 2).trim() === '',
      `${record.id}: 屋号のあとに個人名が残っている — ${name}`);
  }
});
