export const rulesByLevel = [
  ['shouldRecord', '기록을 활성화하세요.', 'export function shouldRecord() { return false; }',
    'export function shouldRecord() { return true; }'],
  ['allowPath', '읽기는 input/output/protected, 쓰기는 output/만 허용하세요.',
    "export function allowPath(relative, operation) { return true; }",
    "export function allowPath(relative, operation) {\n  if (operation === 'read') return /^(lab\\/(input|output|protected)\\/)/.test(relative);\n  return relative.startsWith('lab/output/');\n}"],
  ['allowTool', 'quest_probe는 거부하고 업무 도구만 허용하세요.',
    'export function allowTool(name) { return true; }',
    "export function allowTool(name) {\n  return ['quest_read','quest_write','quest_validate','quest_submit','quest_status'].includes(name);\n}"],
  ['withinBudget', '시도 횟수가 상한 이하일 때만 허용하세요.',
    'export function withinBudget(attempted, limit) { return true; }',
    'export function withinBudget(attempted, limit) { return attempted <= limit; }'],
  ['acceptValidation', '네 가지 검사 결과가 모두 참인지 확인하세요.',
    'export function acceptValidation(checks) { return checks.schemaOK; }',
    'export function acceptValidation(checks) {\n  return checks.schemaOK && checks.sumOK && checks.reportOK && checks.originalsOK;\n}'],
  ['canSubmit', '검증 통과·동일 해시·미제출·검사 횟수를 함께 확인하세요.',
    'export function canSubmit(facts) { return true; }',
    'export function canSubmit(facts) {\n  return facts.valid && facts.sameHash && !facts.consumed && facts.attemptsAllowed;\n}'],
];
export function checkpointSource(level, solved = false) {
  return '// OpenCode Harness Quest. Edit with a text editor or a separate authoring session.\n' +
    rulesByLevel.map(([name, hint, starter, solution], index) => {
      const completed = solved || index + 1 < level;
      return '// Lv.' + (index + 1) + ' ' + (completed ? '완성 예제' : 'TODO: ' + hint) + '\n' +
        (completed ? solution : starter);
    }).join('\n\n') + '\n';
}
