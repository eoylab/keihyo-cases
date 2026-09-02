// An MCP server over the dataset. stdio, no network, no key.
//
// The reason this exists rather than just a JSON file: the people who need this
// are building advertising-review assistants, and what they lack is not the file
// but a way for a model to cite a real enforcement action instead of inventing
// one. Every tool below returns the agency's own wording and the URL it came
// from, so the model quotes rather than recalls.
//
// It answers only from data/cases.json. It never fetches, never infers, and
// never judges whether anything is a violation — each record is a restatement of
// an order the agency already published.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dataPath = join(here, '..', '..', 'data', 'cases.json');
const cases = JSON.parse(readFileSync(dataPath, 'utf8'));

const TOOLS = [
  {
    name: 'search_cases',
    description: '景品表示法の措置命令・課徴金納付命令を検索する。事業者名・商品名・条項・本文で絞り込める。返るのは消費者庁の公表内容と出典URLのみ。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '事業者名・商品名・本文に対する部分一致' },
        provision: { type: 'string', description: '条項（例: 第5条第1号、ステルスマーケティング）' },
        order_type: { type: 'string', enum: ['措置命令', '課徴金納付命令'] },
        from: { type: 'string', description: '公表日の下限（YYYY-MM-DD）' },
        to: { type: 'string', description: '公表日の上限（YYYY-MM-DD）' },
        limit: { type: 'number', description: '既定 20、上限 100' },
      },
    },
  },
  {
    name: 'get_case',
    description: '1件の処分を id で取得する。',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'list_recent',
    description: '公表日の新しい順に処分を返す。',
    inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
  },
  {
    name: 'stats',
    description: '件数の内訳（年度別・処分種別・条項別）を返す。',
    inputSchema: { type: 'object', properties: {} },
  },
];

const matches = (record, { query, provision, order_type: orderType, from, to }) => {
  if (query !== undefined && query !== '') {
    const haystack = [record.company, record.title, record.lead_text, record.product?.name]
      .filter((v) => typeof v === 'string').join(' ');
    if (!haystack.includes(query)) return false;
  }
  if (provision !== undefined && provision !== '') {
    if (!record.provisions.some((p) => p.includes(provision))) return false;
  }
  if (orderType !== undefined && record.order_type !== orderType) return false;
  if (from !== undefined && record.published_date < from) return false;
  if (to !== undefined && record.published_date > to) return false;
  return true;
};

function call(name, args = {}) {
  if (name === 'search_cases') {
    const limit = Math.min(args.limit ?? 20, 100);
    const found = cases.filter((record) => matches(record, args));
    return { total: found.length, returned: Math.min(found.length, limit), cases: found.slice(0, limit) };
  }
  if (name === 'get_case') {
    const found = cases.find((record) => record.id === args.id);
    return found ?? { error: `no case with id ${args.id}` };
  }
  if (name === 'list_recent') {
    const limit = Math.min(args.limit ?? 10, 100);
    return { cases: cases.slice(0, limit) };
  }
  if (name === 'stats') {
    const count = (key) => cases.reduce((acc, record) => {
      const value = record[key];
      for (const v of Array.isArray(value) ? value : [value]) acc[v] = (acc[v] ?? 0) + 1;
      return acc;
    }, {});
    return {
      total: cases.length,
      by_fiscal_year: count('fiscal_year'),
      by_order_type: count('order_type'),
      by_provision: count('provisions'),
      source: '出典: 消費者庁ウェブサイト',
    };
  }
  return { error: `unknown tool ${name}` };
}

// Minimal JSON-RPC over stdio. Written out rather than pulled from a package so
// the server has no dependencies at all — a data feed that needs an install step
// is one more reason not to try it.
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newline = buffer.indexOf('\n');
  while (newline !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    newline = buffer.indexOf('\n');
    if (line === '') continue;

    let request;
    try { request = JSON.parse(line); } catch { continue; }
    const reply = (result) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result })}\n`);

    if (request.method === 'initialize') {
      reply({
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'keihyo-cases', version: '0.1.0' },
      });
    } else if (request.method === 'tools/list') {
      reply({ tools: TOOLS });
    } else if (request.method === 'tools/call') {
      const output = call(request.params?.name, request.params?.arguments);
      reply({ content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] });
    } else if (request.id !== undefined) {
      reply({});
    }
  }
});
