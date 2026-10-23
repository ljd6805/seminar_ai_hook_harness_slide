import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readPrivate, safePath } from './files.mjs';
import { inspectArtifacts } from './validation.mjs';

export const cases = [
  [1, '기록 활성화', r => r.shouldRecord() === true],
  [2, '정상 쓰기', r => r.allowPath('lab/output/result.json', 'write') === true],
  [2, '원본 쓰기 거부', r => r.allowPath('lab/input/orders.json', 'write') === false],
  [2, '접두사 우회 거부', r => r.allowPath('lab/output-other/x', 'write') === false],
  [2, '정상 읽기', r => r.allowPath('lab/input/orders.json', 'read') === true],
  [3, '정상 도구 허용', r => r.allowTool('quest_read') === true],
  [3, 'probe 도구 거부', r => r.allowTool('quest_probe') === false],
  [3, '알 수 없는 도구 거부', r => r.allowTool('unknown') === false],
  [4, '상한 직전·직후', r => r.withinBudget(8, 8) === true && r.withinBudget(9, 8) === false],
  [5, '정상 결과 허용', r => r.acceptValidation({schemaOK:true,sumOK:true,reportOK:true,originalsOK:true}) === true],
  ...['schemaOK', 'sumOK', 'reportOK', 'originalsOK'].map(key => [5, key + ' 오류 거부', r =>
    r.acceptValidation({schemaOK:true,sumOK:true,reportOK:true,originalsOK:true,[key]:false}) === false]),
  [6, '정상 제출 조건', r => r.canSubmit({valid:true,sameHash:true,consumed:false,attemptsAllowed:true}) === true],
  ...['valid','sameHash','attemptsAllowed'].map(key => [6, key + ' 제출 거부', r =>
    r.canSubmit({valid:true,sameHash:true,consumed:false,attemptsAllowed:true,[key]:false}) === false]),
  [6, '중복 제출 거부', r => r.canSubmit({valid:true,sameHash:true,consumed:true,attemptsAllowed:true}) === false],
];
export function gradeRules(rules, level) {
  return cases.filter(([at]) => at <= level).map(([, name, check]) => {
    try { return { name, pass: check(rules) === true }; }
    catch (error) { return { name, pass: false, error: error.message }; }
  });
}
export function gradeEvidence(root, settings) {
  const file = safePath(root, '.quest/events.jsonl', '.quest').target;
  const events = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
  const live = events.filter(e => e.source === 'opencode' && e.runId === settings.runId);
  const has = (event, predicate = () => true) => live.some(e => e.event === event && predicate(e));
  const paired = live.some(e => e.event === 'after' && live.some(b => b.event === 'before' &&
    b.sessionId === e.sessionId && b.callId === e.callId && b.tool === e.tool));
  const checks = [
    [0, 'OpenCode 플러그인 로드', has('plugin_loaded')],
    [1, '실제 호출 전후 연결', paired],
    [2, '정상 쓰기·경로 차단', has('file_written', e => e.path.startsWith('lab/output/')) && has('denied', e => e.reason.includes('path denied'))],
    [3, '실제 probe 차단', has('denied', e => e.tool === 'quest_probe')],
    [4, '실제 호출 예산 초과', has('denied', e => e.reason.startsWith('LIMIT:'))],
    [5, '실패·수정·재검증', has('validation', e => !e.ok) && has('validation', e => e.ok)],
    [6, '승인·거절·제출 기록', has('approval_requested') && has('approval_rejected') && has('submitted')],
  ].filter(([at]) => at === 0 || (at === 1 && settings.level >= 1) || at === settings.level);
  if (settings.level >= 5) {
    try { checks.push([5, '현재 산출물의 독립 검사', Object.values(inspectArtifacts(root).checks).every(Boolean)]); }
    catch { checks.push([5, '현재 산출물의 독립 검사', false]); }
  }
  return checks.map(([, name, pass]) => ({ name, pass }));
}
export async function gradeProject(root, includeEvidence = false) {
  const settings = readPrivate(root, 'settings.json');
  const file = safePath(root, 'learner/rules.mjs', 'learner').target;
  const rules = await import(pathToFileURL(file).href + '?' + Date.now());
  const local = gradeRules(rules, settings.level);
  const evidence = includeEvidence ? gradeEvidence(root, settings) : [];
  return { level: settings.level, runId: settings.runId, local,
    localPassed: local.every(c => c.pass), evidence,
    livePassed: includeEvidence ? evidence.every(c => c.pass) : null,
    note: '고정 입력 검사만으로 실제 OpenCode 실행 또는 사람 승인을 증명하지 않습니다. 실행 기록은 강사와 대조하세요.' };
}
