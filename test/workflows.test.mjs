// The workflows have to parse, because a broken one does not fail loudly.
//
// refresh.yml shipped with a commit message whose body sat at column 0 inside a
// `run: |` block, which ended the block scalar and made the file invalid YAML.
// GitHub's response was not an error anyone would notice: the workflow
// registered with its filename in place of its name, `workflow_dispatch`
// silently did not exist, and the scheduled run would have failed at startup
// every month. The dataset would simply have stopped growing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const DIR = '.github/workflows';

test('every workflow is well-formed YAML with a name and a trigger', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  assert.ok(files.length > 0, 'ワークフローが1つも無い');

  for (const file of files) {
    const text = readFileSync(`${DIR}/${file}`, 'utf8');
    const lines = text.split('\n');

    // A full YAML parser is not available here (no dependencies), so this
    // checks the specific shape that broke: a line with no indentation that is
    // not a top-level key, i.e. body text that escaped a block scalar.
    for (const [index, line] of lines.entries()) {
      if (line === '' || line.startsWith(' ') || line.startsWith('#')) continue;
      assert.match(line, /^[A-Za-z_][A-Za-z0-9_-]*:/,
        `${file}:${index + 1} 字下げの無い行がキーになっていない — ブロックスカラーから抜け出している: ${line}`);
    }

    assert.match(text, /^name: .+$/m, `${file} に name がない`);
    assert.match(text, /^on:$/m, `${file} に on がない`);
    assert.match(text, /^ {2}(schedule|push|pull_request|workflow_dispatch):/m,
      `${file} にトリガーがない`);
  }
});

test('the refresh workflow refuses a broken scrape before it publishes', () => {
  const text = readFileSync(`${DIR}/refresh.yml`, 'utf8');
  const guard = text.indexOf('check-refresh.mjs');
  const push = text.indexOf('git push');
  assert.ok(guard !== -1, 'check-refresh.mjs を呼んでいない');
  assert.ok(guard < push, '検査より先に push している');
});
