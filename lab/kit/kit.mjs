// 실험실 실습 환경입니다. Harness가 아닙니다.
// 실습 폴더의 .opencode/lab-kit/kit.mjs로 복사되고, .opencode/plugins/harness.js가 import합니다.
// 작업 도구(quest_*)를 만들고, 세션별 횟수를 보관하고, 기록 파일(.quest/events.jsonl)에 씁니다.
// 무엇을 막고 무엇을 남길지는 전부 harness.js가 정합니다. 이 파일은 그 판단을 대신하지 않습니다.
// 상대 경로 ../../quest/lib는 저장소(lab/kit)에서도, 실습 폴더(.opencode/lab-kit)에서도 같은 곳을 가리킵니다.
import { readLab, writeLab, safePath, readPrivate } from '../../quest/lib/files.mjs';
import { inspectArtifacts } from '../../quest/lib/validation.mjs';
import { stateStore } from '../../quest/lib/state.mjs';
import { submitArtifact } from '../../quest/lib/submit.mjs';

export function createLabKit({ root, tool, record = () => {}, acceptValidation = () => true, canSubmit = () => true, source = 'opencode' }) {
  const settings = readPrivate(root, 'settings.json');
  const store = stateStore(root, settings, () => true, source);
  const log = event => store.emit(event, true);
  log({ event: 'plugin_loaded', pluginVersion: 'lab', apiTarget: '1.19.4' });
  // 도구 쪽 사건(파일 씀·검증·승인·제출)도 harness의 record()를 거칩니다. Record를 끄면 이것도 남지 않습니다.
  const toolStore = { get: store.get, save: store.save, emit: event => record(event) };

  function validate(state) {
    if (state.validationAttempts >= 3) throw new Error('LIMIT: at most 3 validation attempts');
    state.validationAttempts += 1;
    const snapshot = inspectArtifacts(root);
    const ok = Boolean(acceptValidation(snapshot.checks));
    state.validation = { ok, hash: snapshot.hash, errors: snapshot.errors };
    store.save(state);
    const result = { ...snapshot, ok, remaining: 3 - state.validationAttempts };
    record({ event: 'validation', sessionId: state.sessionId, ...result });
    return result;
  }
  async function perform(name, args, context) {
    const state = store.get(context.sessionID);
    state.executed += 1;
    store.save(state);
    try {
      if (name === 'quest_status') return { ...state, budget: settings.budget };
      if (name === 'quest_read') return { content: readLab(root, args.path) };
      if (name === 'quest_write') {
        // 제출 영수증 폴더는 harness와 상관없이 도구만 씁니다.
        const rel = safePath(root, args.path).relative;
        if (rel.startsWith('lab/submissions/')) throw new Error('PATH: submissions are tool-owned');
        writeLab(root, rel, args.content);
        state.validation = null;
        store.save(state);
        record({ event: 'file_written', sessionId: state.sessionId, path: rel });
        return { written: rel };
      }
      if (name === 'quest_probe') {
        writeLab(root, 'lab/probe/probe.txt', 'harmless tool probe');
        return { probe: 'executed' };
      }
      if (name === 'quest_validate') return validate(state);
      if (name === 'quest_submit')
        return await submitArtifact({ root, rules: { canSubmit }, store: toolStore, state, context, requestedHash: args.artifactHash });
      throw new Error('TOOL: unknown tool');
    } catch (error) {
      record({ event: 'tool_error', sessionId: state.sessionId, tool: name, reason: error.message });
      throw error;
    }
  }

  const schema = tool.schema;
  const definitions = {
    quest_read: ['Read a course file. Use lab/input/orders.json.', { path: schema.string() }],
    quest_write: ['Write a course output file with UTF-8 text.', { path: schema.string(), content: schema.string() }],
    quest_validate: ['Inspect real output files. Return validation errors and artifactHash as hash.', {}],
    quest_submit: ['Request native approval and submit validated artifacts locally. Use the hash from validation.',
      { artifactHash: schema.string() }],
    quest_status: ['Show the current course run, budget and validation state.', {}],
    quest_probe: ['Harmless training probe: creates lab/probe/probe.txt. Used to test tool denial.', {}],
  };
  const tools = Object.fromEntries(Object.entries(definitions).map(([name, [description, args]]) => [name,
    tool({ description, args, async execute(input, context) { return JSON.stringify(await perform(name, input, context)); } }),
  ]));

  return {
    tools,
    log,
    session: sessionId => store.get(sessionId),
    save: state => store.save(state),
    relative: p => safePath(root, p).relative,
  };
}
