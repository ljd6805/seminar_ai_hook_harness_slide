import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve('quest');
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { visit(file); continue; }
    if (!/\.(mjs|js)$/.test(file)) continue;
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
    // Every source file is <=100 lines, so no contained function can exceed 100 lines.
    const lines = fs.readFileSync(file, 'utf8').trimEnd().split('\n').length;
    if (lines > 100) throw new Error(file + ' has ' + lines + ' lines; split the module');
  }
}
visit(root);
console.log('Syntax and <=100-line source modules: PASS');
