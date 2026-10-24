#!/usr/bin/env node
import path from 'node:path';
import { initProject, applyCheckpoint } from './lib/setup.mjs';
import { gradeProject } from './lib/grader.mjs';
import { readPrivate } from './lib/files.mjs';

const [command, destination, ...options] = process.argv.slice(2);
function levelOption() {
  const index = options.indexOf('--level');
  const value = index >= 0 ? Number(options[index + 1]) : 0;
  if (!Number.isInteger(value) || value < 0 || value > 6) throw new Error('--level must be 0..6');
  return value;
}
async function main() {
  if (!['init','checkpoint','check','status'].includes(command) || !destination) {
    console.log('node quest/cli.mjs init <new-folder> --level 0 [--solution]\n' +
      'node quest/cli.mjs checkpoint <folder> --level 1 [--solution]\n' +
      'node quest/cli.mjs check <folder> [--evidence]\nnode quest/cli.mjs status <folder>');
    process.exitCode = 1;
    return;
  }
  const root = path.resolve(destination);
  if (command === 'init') {
    initProject(root, levelOption(), options.includes('--solution'));
    console.log('Created ' + root + '\nOpenCode 1.19.4 reference. Configure your permitted model, then start opencode here.');
  } else if (command === 'checkpoint') {
    const backup = applyCheckpoint(root, levelOption(), options.includes('--solution'));
    console.log('Rules backed up: ' + backup + '\nRestart OpenCode and use a NEW session. Existing lab outputs are preserved.');
  } else if (command === 'status') console.log(JSON.stringify(readPrivate(root, 'settings.json'), null, 2));
  else {
    const result = await gradeProject(root, options.includes('--evidence'));
    console.log(JSON.stringify(result, null, 2));
    if (!result.localPassed || result.livePassed === false) process.exitCode = 2;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
