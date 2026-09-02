// Turns one 消費者庁 press-release page into one record, deterministically.
//
// No model, no judgement, no inference. Every field is either lifted verbatim
// from the page or derived from it by a rule you can read here. The reason is
// that the product's whole value is being able to say "the agency published
// this, on this date, at this URL" — the moment a field is a guess, the record
// stops being evidence and becomes an opinion about a named company.
//
// So: when a field cannot be extracted, it is null and the entry is recorded as
// unparsed. It is never filled in.

const strip = (html) => html
  .replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ')
  .trim();

/** The article body. Everything outside #main is site furniture. */
const mainBlock = (html) => {
  const start = html.indexOf('<div id="main">');
  if (start === -1) return null;
  // The container is not closed in a way a regex can match reliably, so cut at
  // the next sibling block instead — both markers were present on every page
  // sampled, and if neither is, the caller treats the entry as unparsed.
  const rest = html.slice(start);
  const end = rest.search(/<!--\s*\/?main\s*(End|Ends)?\s*-->|<div id="side/);
  return end === -1 ? rest : rest.slice(0, end);
};

/** 措置命令 / 課徴金納付命令, taken from the title rather than guessed. */
const orderType = (title) => {
  if (title.includes('課徴金納付命令')) return '課徴金納付命令';
  if (title.includes('措置命令')) return '措置命令';
  return null;
};

/**
 * The company, taken from the title's own construction.
 *
 * Titles read 「〈事業者〉に対する景品表示法に基づく〈処分〉について」, so the
 * name is what precedes 「に対する」. Anything else is left null rather than
 * cut at a guess — a wrong company name on a record about an enforcement
 * action is the one error this dataset must never contain.
 */
const company = (title) => {
  const at = title.indexOf('に対する');
  if (at <= 0) return null;
  const name = title.slice(0, at).trim();
  return name === '' ? null : name;
};

/** Every 景品表示法 provision the page cites, in order, deduplicated. */
const provisions = (text) => {
  const found = text.match(/第\d+条(?:第\d+[項号])*(?:\([^)]{1,40}\))?/g) ?? [];
  return [...new Set(found)];
};

/** The product or service, from the 「〜と称する」 construction the agency uses. */
const product = (text) => {
  const match = text.match(/「([^」]{1,80})」と称する([^、。]{1,40})/);
  return match === null ? null : { name: match[1], kind: match[2].trim() };
};

export function extractCase(html, { url, id, fiscalYear }) {
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const title = titleMatch === null ? null : strip(titleMatch[1]);

  const main = mainBlock(html);
  const body = main === null ? '' : strip(main);

  const dateMatch = main === null
    ? null
    : main.match(/<!--\s*公表日\s*-->\s*<p[^>]*>\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
  const publishedDate = dateMatch === null
    ? null
    : `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;

  const excerptMatch = main === null
    ? null
    : main.match(/id="block_excerpt"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/);
  const leadText = excerptMatch === null ? null : strip(excerptMatch[1]);

  // PDFs are injected by script on these pages, so the href is often absent from
  // the served HTML. Absent is recorded as absent.
  const pdfMatch = main === null ? null : main.match(/href="([^"]+\.pdf)"/);

  const record = {
    id,
    url,
    fiscal_year: fiscalYear,
    published_date: publishedDate,
    title,
    company: title === null ? null : company(title),
    order_type: title === null ? null : orderType(title),
    provisions: provisions(body),
    product: product(body),
    pdf_url: pdfMatch === null ? null : new URL(pdfMatch[1], url).href,
    lead_text: leadText,
    authority: '消費者庁',
    source: '出典: 消費者庁ウェブサイト',
  };

  // What makes a record usable as evidence: who, what was done, when, and where
  // to read it. Missing any of those and it is not evidence.
  const required = ['title', 'company', 'order_type', 'published_date', 'lead_text'];
  const missing = required.filter((field) => record[field] === null);
  return { record, missing };
}
