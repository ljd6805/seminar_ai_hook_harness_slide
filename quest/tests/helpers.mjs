import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initProject } from '../lib/setup.mjs';
import { createRuntime } from '../lib/runtime.mjs';
import * as rules from '../solutions/rules.mjs';
import { writeLab } from '../lib/files.mjs';

export function fixture(t, level = 6) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-quest-'));
  const root = path.join(parent, 'lab');
  initProject(root, level, true);
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  return root;
}
export function goodOutput(root) {
  writeLab(root, 'lab/output/summary.json', JSON.stringify({ currency:'KRW',itemCount:3,total:13000 }));
  writeLab(root, 'lab/output/report.md', '# 집계 결과\n총액은 13000원입니다.');
}
export function driver(root, options = {}) {
  const runtime = createRuntime(root, options.rules || rules);
  let id = 0;
  const context = { sessionID: options.session || 'test-session', agent: 'quest',
    abort: new AbortController().signal, ask: options.ask || (async () => {}) };
  async function call(tool, args = {}) {
    const input = { tool, sessionID: context.sessionID, callID: 'call-' + (++id) };
    runtime.before(input, args);
    const result = await runtime.perform(tool, args, context);
    runtime.after(input, { output: JSON.stringify(result) });
    return result;
  }
  return { call, runtime, context };
}
