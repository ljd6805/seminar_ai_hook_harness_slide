#!/usr/bin/env node
// lab/index.html을 다시 만들 때 쓰는 도구입니다.
// node lab/build.mjs   (기본: lab/src/index.template.html + lab/src/evidence.json)
// 템플릿의 /*__HARNESS_KIT__*/ 자리에 lab/kit/harness-source.mjs를(export만 지우고) 넣고,
// __DATA__ 자리에 기록 재생용 사건 묶음을 넣습니다. 서버와 화면이 같은 코드 생성기·검사기를 쓰게 하려는 것입니다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [template = path.join(here, 'src', 'index.template.html'), data = path.join(here, 'src', 'evidence.json')] = process.argv.slice(2);
const kit = fs.readFileSync(path.join(here, 'kit', 'harness-source.mjs'), 'utf8').replace(/^export (?=const |function |async function )/gm, '');
const evidence = fs.readFileSync(data, 'utf8').replace(/<\//g, '<\\/');
const html = fs.readFileSync(template, 'utf8')
  .replace('/*__HARNESS_KIT__*/', () => kit.replace(/<\/script/gi, '<\\/script'))
  .replace('__DATA__', () => evidence);
fs.writeFileSync(path.join(here, 'index.html'), html);
console.log('lab/index.html', (html.length / 1024).toFixed(0) + ' KB');
