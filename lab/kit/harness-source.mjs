// Hook·Harness 실험실의 Harness 코드 생성기와 검사기입니다.
// 서버(lab/server.mjs)가 import하고, 같은 내용이 lab/index.html에도 그대로 들어갑니다(빌드 시 export만 지움).
// 브라우저에서도 돌아야 하므로 Node 내장 모듈을 쓰지 않습니다.

export const TOOLS = ['quest_read', 'quest_write', 'quest_validate', 'quest_submit', 'quest_status', 'quest_probe'];
export const CHECKS = { schemaOK: '스키마', sumOK: '합계', reportOK: '보고서', originalsOK: '원본 보존' };
export const SUBMITS = { valid: '검증 통과', sameHash: '검증한 파일 그대로', notConsumed: '한 번만 제출', attemptsAllowed: '검사 횟수 이내' };
export const PRESETS = {
  full: { record: true, toolsOn: true, tools: TOOLS.filter(t => t !== 'quest_probe'), pathOn: true,
    read: ['lab/input/', 'lab/output/', 'lab/protected/'], write: ['lab/output/'], limitOn: true, budget: 8,
    checks: Object.keys(CHECKS), submit: Object.keys(SUBMITS), approval: 'ask' },
  naked: { record: true, toolsOn: false, tools: TOOLS, pathOn: false, read: ['lab/'], write: ['lab/'], limitOn: false,
    budget: 8, checks: ['schemaOK'], submit: [], approval: 'allow' },
};

export function normalizeConfig(input = {}) {
  const base = PRESETS.full;
  const pick = (value, allowed) => (Array.isArray(value) ? value : []).filter(v => allowed.includes(v));
  const prefixes = value => (Array.isArray(value) ? value : String(value || '').split('\n'))
    .map(v => String(v).trim()).filter(v => v && !v.includes('..') && !v.includes("'") && !v.includes('\\'));
  const flag = (key) => key in input ? Boolean(input[key]) : base[key];
  return {
    record: flag('record'), toolsOn: flag('toolsOn'), tools: pick(input.tools ?? base.tools, TOOLS),
    pathOn: flag('pathOn'), read: prefixes(input.read ?? base.read), write: prefixes(input.write ?? base.write),
    limitOn: flag('limitOn'), budget: Math.max(1, Math.min(50, Math.floor(Number(input.budget) || 8))),
    checks: pick(input.checks ?? base.checks, Object.keys(CHECKS)), submit: pick(input.submit ?? base.submit, Object.keys(SUBMITS)),
    approval: ['ask', 'allow', 'deny'].includes(input.approval) ? input.approval : 'ask',
  };
}

const quoteList = list => '[' + list.map(v => "'" + v + "'").join(', ') + ']';

// 기본 과정: 폼 설정으로 .opencode/plugins/harness.js 전체를 만듭니다.
// 줄마다 어느 폼 항목에서 나온 줄인지(region)를 함께 돌려주어 화면에서 해당 줄을 강조할 수 있게 합니다.
export function harnessSource(input) {
  const c = normalizeConfig(input);
  const out = [];
  const add = (region, ...lines) => lines.forEach(text => out.push({ region, text }));
  const guarded = c.limitOn || c.toolsOn || c.pathOn;
  const ind = guarded ? '        ' : '      ';
  add('', '// .opencode/plugins/harness.js',
    '// OpenCode는 도구를 실행하기 직전(before)과 직후(after)에 이 파일의 함수를 부릅니다.',
    '// 실험실 기본 과정에서 고른 설정으로 만든 코드입니다.',
    "import { tool } from '@opencode-ai/plugin';",
    "import { createLabKit } from '../lab-kit/kit.mjs';",
    '',
    'export const LabHarness = async ({ directory }) => {',
    '  // 실습 환경(작업 도구·횟수 보관함·기록 파일)입니다. Harness는 아닙니다.',
    '  const kit = createLabKit({ root: directory, tool, record, acceptValidation, canSubmit });',
    '');
  if (c.record) add('record',
    '  // [Record] 본 것과 판단을 .quest/events.jsonl에 남깁니다.',
    '  function record(event) {',
    '    kit.log(event);',
    '  }');
  else add('record',
    '  // [Record] 꺼짐: 아무것도 남기지 않습니다.',
    '  function record(event) {}');
  add('', '',
    '  return {',
    '    tool: kit.tools,',
    '',
    '    // ① 실행 직전. 여기서 throw하면 도구는 실행되지 않습니다.',
    "    'tool.execute.before': async (input, output) => {",
    "      if (!input.tool.startsWith('quest_')) return;",
    '      const call = { sessionId: input.sessionID, callId: input.callID, tool: input.tool };',
    '      const state = kit.session(input.sessionID);');
  add('record', "      record({ ...call, event: 'before' });");
  if (guarded) add('', '      try {');
  if (c.limitOn) add('limit',
    ind + '// [Limit] 세션마다 ' + c.budget + '회까지만 받습니다. quest_status는 세지 않습니다.',
    ind + "if (input.tool !== 'quest_status') {",
    ind + '  state.attempted += 1;',
    ind + '  kit.save(state);',
    ind + '  if (state.attempted > ' + c.budget + ") throw new Error('LIMIT: tool request budget exhausted');",
    ind + '}',
    ind + '// 검증에 세 번 실패하면 더 쓰지 못하게 합니다.',
    ind + "if (input.tool === 'quest_write' && state.validationAttempts >= 3 && !state.validation?.ok)",
    ind + "  throw new Error('LIMIT: validation attempts exhausted');");
  if (c.toolsOn) add('tools',
    ...(c.limitOn ? [''] : []),
    ind + '// [Policy·도구] 목록에 있는 도구만 실행합니다.',
    ind + 'const allowedTools = ' + quoteList(c.tools) + ';',
    ind + "if (!allowedTools.includes(input.tool)) throw new Error('POLICY: tool denied');");
  if (c.pathOn) add('paths',
    ...(c.limitOn || c.toolsOn ? [''] : []),
    ind + '// [Policy·경로] 허용한 경로로 시작할 때만 읽고 씁니다.',
    ind + "if (input.tool === 'quest_read' || input.tool === 'quest_write') {",
    ind + '  const where = kit.relative(output.args.path);',
    ind + "  const allowed = input.tool === 'quest_read'",
    ind + '    ? ' + quoteList(c.read),
    ind + '    : ' + quoteList(c.write) + ';',
    ind + "  if (!allowed.some(prefix => where.startsWith(prefix))) throw new Error('POLICY: path denied');",
    ind + '}');
  if (guarded) {
    add('', '      } catch (error) {');
    add('record', "        record({ ...call, event: 'denied', reason: error.message, executed: false });");
    add('', '        throw error; // 다시 던져야 실행이 멈춥니다.', '      }');
  }
  add('', '    },', '',
    '    // ② 실행 직후.',
    "    'tool.execute.after': async (input, output) => {",
    "      if (!input.tool.startsWith('quest_')) return;");
  add('record',
    "      record({ sessionId: input.sessionID, callId: input.callID, tool: input.tool, event: 'after',",
    '        output: String(output.output).slice(0, 2000) });');
  add('', '    },', '  };', '');
  const checks = c.checks.map(k => 'checks.' + k);
  add('validation',
    '  // [Validation] quest_validate가 이 함수로 통과를 정합니다.',
    '  function acceptValidation(checks) {',
    ...(checks.length ? ['    return ' + checks.join(' && ') + ';']
      : ['    return true; // 아무것도 보지 않습니다. 무엇을 써도 통과합니다.']),
    '  }');
  const map = { valid: 'facts.valid', sameHash: 'facts.sameHash', notConsumed: '!facts.consumed', attemptsAllowed: 'facts.attemptsAllowed' };
  const submit = c.submit.map(k => map[k]);
  add('', '');
  add('submit',
    '  // [Approval] quest_submit이 사람에게 묻기 전에 보는 조건입니다.',
    '  // 물을지 말지는 opencode.json의 quest_publish(ask·allow·deny)가 정합니다.',
    '  function canSubmit(facts) {',
    ...(submit.length ? ['    return ' + submit.join(' && ') + ';']
      : ['    return true; // 아무 조건 없이 제출 요청을 받습니다.']),
    '  }');
  add('', '};', '');
  return { source: out.map(l => l.text).join('\n'), regions: out.map(l => l.region) };
}

export function approvalSnippet(approval) {
  return '// opencode.json (일부)\n"permission": {\n  "quest_*": "allow",\n  "quest_publish": "' + approval + '"\n}';
}

// 고급 과정의 출발점입니다. 도구 등록과 Hook 자리만 있고 판단은 비어 있습니다.
export const STARTER = [
  '// .opencode/plugins/harness.js',
  '// 고급 과정: 이 파일을 직접 채워 Harness를 만듭니다. 왼쪽 미션을 하나씩 해결하고 [검사하기]로 확인합니다.',
  'import { tool } from \'@opencode-ai/plugin\';',
  'import { createLabKit } from \'../lab-kit/kit.mjs\';',
  '',
  'export const LabHarness = async ({ directory }) => {',
  '  // 실습 환경: 작업 도구(quest_*), 세션별 횟수 보관함(kit.session·kit.save), 기록 파일(kit.log).',
  '  const kit = createLabKit({ root: directory, tool, record, acceptValidation, canSubmit });',
  '',
  '  function record(event) {',
  '    // 미션 2: 여기서 kit.log(event)를 불러 기록을 남기세요.',
  '  }',
  '',
  '  return {',
  '    tool: kit.tools,',
  '',
  '    // 도구를 실행하기 직전. 막으려면 throw new Error(\'POLICY: ...\')처럼 던집니다.',
  '    \'tool.execute.before\': async (input, output) => {',
  '      if (!input.tool.startsWith(\'quest_\')) return;',
  '      const call = { sessionId: input.sessionID, callId: input.callID, tool: input.tool };',
  '      const state = kit.session(input.sessionID); // { attempted, validationAttempts, validation, consumed }',
  '',
  '    },',
  '',
  '    // 도구를 실행한 직후. output.output에 결과 문자열이 들어 있습니다.',
  '    \'tool.execute.after\': async (input, output) => {',
  '      if (!input.tool.startsWith(\'quest_\')) return;',
  '',
  '    },',
  '  };',
  '',
  '  function acceptValidation(checks) { // { schemaOK, sumOK, reportOK, originalsOK }',
  '    return true; // 미션 7',
  '  }',
  '',
  '  function canSubmit(facts) { // { valid, sameHash, consumed, attemptsAllowed }',
  '    return true; // 미션 8',
  '  }',
  '};',
  '',
].join('\n');

// 고급 과정 미션입니다. hint는 막혔을 때 펼쳐 보는 예시 코드입니다.
export const MISSIONS = [
  { id: 'hook', title: 'Hook 등록', goal: '플러그인이 작업 도구와 before·after Hook을 OpenCode에 돌려줍니다.',
    hint: "return {\n  tool: kit.tools,\n  'tool.execute.before': async (input, output) => { ... },\n  'tool.execute.after': async (input, output) => { ... },\n};" },
  { id: 'record', title: 'Record', goal: 'before와 after에서 record()로 사건을 남기고, record()는 kit.log()로 파일에 씁니다.',
    hint: "function record(event) { kit.log(event); }\n// before 안에서\nrecord({ ...call, event: 'before' });\n// after 안에서\nrecord({ sessionId: input.sessionID, callId: input.callID,\n  tool: input.tool, event: 'after', output: String(output.output) });" },
  { id: 'paths', title: 'Policy · 경로', goal: '쓰기는 lab/output/ 아래만, 읽기는 lab/input/·lab/output/·lab/protected/만 허용합니다. lab/output-other/ 같은 비슷한 이름도 막아야 합니다.',
    hint: "if (input.tool === 'quest_read' || input.tool === 'quest_write') {\n  const where = kit.relative(output.args.path);\n  const allowed = input.tool === 'quest_read'\n    ? ['lab/input/', 'lab/output/', 'lab/protected/']\n    : ['lab/output/'];\n  if (!allowed.some(p => where.startsWith(p)))\n    throw new Error('POLICY: path denied');\n}" },
  { id: 'tools', title: 'Policy · 도구', goal: 'quest_probe는 막고, 업무 도구(read·write·validate·submit·status)만 실행합니다.',
    hint: "const allowedTools = ['quest_read', 'quest_write', 'quest_validate', 'quest_submit', 'quest_status'];\nif (!allowedTools.includes(input.tool)) throw new Error('POLICY: tool denied');" },
  { id: 'denied', title: '막은 이유 기록', goal: '막을 때는 throw하기 전에 denied 사건과 이유(reason)를 남깁니다.',
    hint: "try {\n  // Limit·Policy 검사들\n} catch (error) {\n  record({ ...call, event: 'denied', reason: error.message, executed: false });\n  throw error;\n}" },
  { id: 'limit', title: 'Limit', goal: '세션마다 도구 시도를 8회까지만 받고 9번째부터 LIMIT으로 막습니다. quest_status는 세지 않습니다.',
    hint: "if (input.tool !== 'quest_status') {\n  state.attempted += 1;\n  kit.save(state);\n  if (state.attempted > 8) throw new Error('LIMIT: tool request budget exhausted');\n}" },
  { id: 'validation', title: 'Validation', goal: '네 가지 검사(schemaOK·sumOK·reportOK·originalsOK)가 모두 참일 때만 통과시킵니다.',
    hint: 'function acceptValidation(checks) {\n  return checks.schemaOK && checks.sumOK && checks.reportOK && checks.originalsOK;\n}' },
  { id: 'submit', title: '제출 조건', goal: '검증 통과, 검증한 파일 그대로, 아직 제출 안 함, 검사 횟수 이내일 때만 제출 요청을 받습니다.',
    hint: 'function canSubmit(facts) {\n  return facts.valid && facts.sameHash && !facts.consumed && facts.attemptsAllowed;\n}' },
];

// ---------- 코드 실행과 검사 ----------
// 소스의 import·export를 걷어 내고 함수로 만듭니다. tool과 createLabKit은 호출하는 쪽이 넣어 줍니다.
export function compileHarness(source) {
  const body = String(source)
    .replace(/^\s*import\s[^;]*?from\s*['"][^'"]+['"];?\s*$/gm, '')
    .replace(/export\s+const\s+([A-Za-z_$][\w$]*)\s*=/, 'const __harness = ')
    .replace(/export\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)/, (m, a) => 'const __harness = ' + (a || '') + 'function');
  if (!/__harness/.test(body)) throw new Error('export const 이름 = async ({ directory }) => { ... } 형태의 플러그인을 찾지 못했습니다.');
  try { return new Function('tool', 'createLabKit', '"use strict";\n' + body + '\nreturn __harness;'); }
  catch (error) {
    const detail = /__harness/.test(error.message) ? '' : ' (' + error.message + ')';
    throw new Error('문법 오류가 있습니다' + detail + '. 닫히지 않은 괄호나 빠진 쉼표가 없는지 확인하세요.');
  }
}

function probeKit() {
  const sessions = new Map(), events = [];
  let captured = {};
  const createLabKit = opts => {
    captured = opts || {};
    return {
      tools: { quest_read: {}, quest_write: {}, quest_validate: {}, quest_submit: {}, quest_status: {}, quest_probe: {} },
      log: event => events.push(event),
      session: id => { if (!sessions.has(id)) sessions.set(id, { sessionId: id, attempted: 0, executed: 0, validationAttempts: 0, validation: null, consumed: false }); return sessions.get(id); },
      save: () => {},
      relative: p => { if (typeof p !== 'string' || p.includes('..') || p.startsWith('/')) throw new Error('PATH: outside permitted root'); return p.replace(/^\.\//, ''); },
    };
  };
  const tool = Object.assign(x => x, { schema: new Proxy({}, { get: () => () => new Proxy({}, { get: (t, k) => () => t }) }) });
  return { createLabKit, tool, events, captured: () => captured };
}

// 코드를 고정 입력으로 돌려 미션별 통과 여부와, 화면이 쓸 실제 동작(info)을 알아냅니다.
export async function probeHarness(source) {
  const result = { ok: false, error: null, missions: {}, info: null };
  let factory;
  try { factory = compileHarness(source); } catch (error) { result.error = '코드를 읽지 못했습니다: ' + error.message; return result; }
  const kit = probeKit();
  let hooks, kitObj;
  try {
    const plugin = factory(kit.tool, opts => (kitObj = kit.createLabKit(opts)));
    hooks = await plugin({ directory: '/probe' });
  } catch (error) { result.error = '플러그인을 만들다 오류가 났습니다: ' + error.message; return result; }
  if (!hooks || typeof hooks !== 'object') { result.error = '플러그인이 Hook 객체를 돌려주지 않았습니다.'; return result; }
  let n = 0;
  async function before(session, tool, args = {}) {
    const start = kit.events.length;
    const fn = hooks['tool.execute.before'];
    try { if (fn) await fn({ tool, sessionID: session, callID: 'c' + (++n) }, { args }); return { ok: true, events: kit.events.slice(start) }; }
    catch (error) { return { ok: false, reason: String(error?.message || error), events: kit.events.slice(start) }; }
  }
  async function after(session, tool) {
    const start = kit.events.length;
    try { await hooks['tool.execute.after']?.({ tool, sessionID: session, callID: 'a' + (++n) }, { output: '{"ok":true}', title: '', metadata: {} }); }
    catch { /* after의 오류는 아래 검사에서 기록 누락으로 드러납니다 */ }
    return kit.events.slice(start);
  }
  const blocked = (r, word) => !r.ok && r.reason.includes(word);
  const cap = kit.captured();
  const judge = (fn, arg) => { try { return Boolean(fn?.(arg)); } catch { return null; } };
  const m = result.missions;
  const say = (id, pass, why) => { m[id] = { pass: Boolean(pass), why: pass ? '' : why }; };

  say('hook', typeof hooks['tool.execute.before'] === 'function' && typeof hooks['tool.execute.after'] === 'function' && hooks.tool && hooks.tool === kitObj?.tools,
    !hooks.tool ? 'tool: kit.tools가 없어 Agent가 작업 도구를 쓸 수 없습니다.' : 'tool.execute.before와 tool.execute.after를 둘 다 돌려주어야 합니다.');

  const r1 = await before('rec', 'quest_read', { path: 'lab/input/orders.json' });
  const a1 = await after('rec', 'quest_read');
  const recBefore = r1.events.some(e => e.event === 'before' && e.tool === 'quest_read');
  const recAfter = a1.some(e => e.event === 'after' && e.tool === 'quest_read');
  say('record', recBefore && recAfter, !recBefore ? "before에서 record({ ...call, event: 'before' })가 kit.log까지 가지 않았습니다." : "after에서 event: 'after' 기록이 없습니다.");

  const pw = [
    ['lab/protected/settings.json', 'write', false], ['lab/input/orders.json', 'write', false], ['lab/output-other/x.txt', 'write', false],
    ['lab/output/summary.json', 'write', true], ['lab/input/orders.json', 'read', true], ['lab/protected/settings.json', 'read', true], ['lab/secret.txt', 'read', false],
  ];
  const pathFails = [];
  for (const [p, op, allow] of pw) {
    const r = await before('path-' + p + op, op === 'read' ? 'quest_read' : 'quest_write', { path: p, content: 'x' });
    if (allow ? !r.ok : !blocked(r, 'POLICY')) pathFails.push((op === 'read' ? '읽기 ' : '쓰기 ') + p + (allow ? '는 허용해야 합니다' : "는 'POLICY'로 막아야 합니다"));
  }
  say('paths', !pathFails.length, pathFails[0]);

  const probe = await before('tool-probe', 'quest_probe');
  const okTools = [];
  for (const t of ['quest_read', 'quest_write', 'quest_validate', 'quest_submit', 'quest_status'])
    if (!(await before('tool-' + t, t, { path: t === 'quest_read' ? 'lab/input/orders.json' : 'lab/output/summary.json', content: 'x' })).ok) okTools.push(t);
  say('tools', blocked(probe, 'POLICY') && !okTools.length, !blocked(probe, 'POLICY') ? "quest_probe를 'POLICY'로 막아야 합니다." : okTools[0] + '는 허용해야 합니다.');

  const deniedRec = probe.events.some(e => e.event === 'denied' && typeof e.reason === 'string' && e.reason.length > 0);
  say('denied', !probe.ok && deniedRec, probe.ok ? '먼저 막는 코드가 있어야 확인할 수 있습니다.' : "throw하기 전에 record({ ...call, event: 'denied', reason: error.message })를 남기세요.");

  let budget = null;
  for (let i = 1; i <= 60; i++) {
    const r = await before('limit', 'quest_read', { path: 'lab/input/orders.json' });
    if (!r.ok) { if (r.reason.includes('LIMIT')) budget = i - 1; break; }
  }
  let statusFree = true;
  for (let i = 0; i < 12; i++) await before('limit-status', 'quest_status');
  if (!(await before('limit-status', 'quest_read', { path: 'lab/input/orders.json' })).ok) statusFree = false;
  say('limit', budget === 8 && statusFree, budget === null ? "9번째 시도에서 'LIMIT'으로 막아야 합니다." : budget !== 8 ? budget + '번까지 받고 막았습니다. 8번까지 받아야 합니다.' : 'quest_status는 시도 횟수에 넣지 않아야 합니다.');

  const all = { schemaOK: true, sumOK: true, reportOK: true, originalsOK: true };
  const loose = Object.keys(all).filter(k => judge(cap.acceptValidation, { ...all, [k]: false }) !== false);
  say('validation', judge(cap.acceptValidation, all) === true && !loose.length,
    judge(cap.acceptValidation, all) !== true ? '모두 참이면 통과시켜야 합니다.' : loose[0] + '가 거짓인데도 통과시킵니다.');

  const facts = { valid: true, sameHash: true, consumed: false, attemptsAllowed: true };
  const bad = [['valid', false], ['sameHash', false], ['consumed', true], ['attemptsAllowed', false]]
    .filter(([k, v]) => judge(cap.canSubmit, { ...facts, [k]: v }) !== false).map(([k]) => k);
  say('submit', judge(cap.canSubmit, facts) === true && !bad.length,
    judge(cap.canSubmit, facts) !== true ? '조건을 모두 갖추면 받아야 합니다.' : bad[0] + (bad[0] === 'consumed' ? '(이미 제출함)' : '이 거짓') + '인데도 받습니다.');

  result.ok = Object.values(m).every(x => x.pass);
  result.info = {
    record: recBefore, toolsOn: blocked(probe, 'POLICY'),
    pathOn: blocked(await before('info-path', 'quest_write', { path: 'lab/protected/settings.json', content: 'x' }), 'POLICY'),
    limitOn: budget !== null, budget: budget ?? 8, checksAll: m.validation.pass,
  };
  return result;
}
