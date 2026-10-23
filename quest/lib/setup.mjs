import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { hash, writePrivate, readPrivate, safePath } from './files.mjs';
import { checkpointSource } from './checkpoints.mjs';

const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function courseConfig() {
  return {
    $schema: 'https://opencode.ai/config.json',
    default_agent: 'quest',
    agent: { quest: {
      mode: 'primary', description: 'Harness Quest course agent', steps: 12,
      prompt: 'Use only quest tools for the lab. Never modify policies, logs or graders. ' +
        'Do not submit unless validation passed. Report tool denials instead of bypassing them. ' +
        'Use a new session after checkpoint changes. All orders are fake course data.',
      permission: { '*': 'deny', 'quest_*': 'allow', quest_publish: 'ask' },
    } },
  };
}
export function initProject(destination, level = 0, solved = false) {
  if (fs.existsSync(destination)) throw new Error('INIT: destination must not exist; choose a new folder');
  fs.mkdirSync(destination, { recursive: true });
  for (const dir of ['.opencode/plugins', '.quest', 'learner', 'lab/input', 'lab/output',
    'lab/protected', 'lab/output-other', 'lab/submissions', 'quest/lib'])
    fs.mkdirSync(path.join(destination, dir), { recursive: true });
  for (const file of fs.readdirSync(path.join(kit, 'lib')))
    if (file.endsWith('.mjs')) fs.copyFileSync(path.join(kit, 'lib', file), path.join(destination, 'quest/lib', file));
  fs.copyFileSync(path.join(kit, 'templates/plugin.js'), path.join(destination, '.opencode/plugins/harness.js'));
  fs.writeFileSync(path.join(destination, '.opencode/package.json'), JSON.stringify({ type: 'module',
    dependencies: { '@opencode-ai/plugin': '1.19.4' } }, null, 2));
  fs.writeFileSync(path.join(destination, 'opencode.json'), JSON.stringify(courseConfig(), null, 2));
  fs.writeFileSync(path.join(destination, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  const orders = JSON.stringify({ currency: 'KRW', items: [
    { id: 'A', amount: 10000 }, { id: 'B', amount: 5000 }, { id: 'discount', amount: -2000 },
  ] }, null, 2) + '\n';
  const protectedText = '{"setting":"do-not-change"}\n';
  fs.writeFileSync(path.join(destination, 'lab/input/orders.json'), orders);
  fs.writeFileSync(path.join(destination, 'lab/protected/settings.json'), protectedText);
  writePrivate(destination, 'baseline.json', { orders: hash(orders), protected: hash(protectedText) });
  writePrivate(destination, 'settings.json', { kit: 'harness-quest', runId: randomUUID(), level, budget: 8 });
  fs.writeFileSync(path.join(destination, 'learner/rules.mjs'), checkpointSource(level, solved));
}
export function applyCheckpoint(destination, level, solved = false) {
  const settings = readPrivate(destination, 'settings.json');
  if (settings.kit !== 'harness-quest') throw new Error('CHECKPOINT: not a course project');
  const target = safePath(destination, 'learner/rules.mjs', 'learner').target;
  const backup = '.quest/backups/' + randomUUID() + '.mjs';
  const backupPath = safePath(destination, backup, '.quest').target;
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(target, backupPath);
  fs.writeFileSync(target, checkpointSource(level, solved));
  writePrivate(destination, 'settings.json', { ...settings, level, runId: randomUUID() });
  return backup;
}
