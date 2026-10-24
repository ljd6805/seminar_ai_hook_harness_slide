import { readLab, writeLab, safePath, readPrivate } from './files.mjs';
import { inspectArtifacts } from './validation.mjs';
import { stateStore } from './state.mjs';
import { submitArtifact } from './submit.mjs';

export function createRuntime(root, rules, source = 'unit-test') {
  const settings = readPrivate(root, 'settings.json');
  const store = stateStore(root, settings, rules.shouldRecord, source);
  store.emit({ event: 'plugin_loaded', pluginVersion: '0.1.0', apiTarget: '1.19.4' }, true);
  function before(input, args) {
    if (!input.tool.startsWith('quest_')) return;
    const state = store.get(input.sessionID);
    const event = { sessionId: input.sessionID, callId: input.callID, tool: input.tool };
    store.emit({ ...event, event: 'before' });
    try {
      if (input.tool !== 'quest_status') {
        state.attempted += 1;
        store.save(state);
        if (!rules.withinBudget(state.attempted, settings.budget)) throw new Error('LIMIT: tool request budget exhausted');
      }
      if (!rules.allowTool(input.tool)) throw new Error('POLICY: tool denied');
      if (input.tool === 'quest_read' || input.tool === 'quest_write') {
        const operation = input.tool === 'quest_read' ? 'read' : 'write';
        const { relative } = safePath(root, args.path);
        if (!rules.allowPath(relative, operation)) throw new Error('POLICY: path denied');
      }
      if (input.tool === 'quest_write' && state.validationAttempts >= 3 && !state.validation?.ok)
        throw new Error('LIMIT: validation attempts exhausted');
    } catch (error) {
      store.emit({ ...event, event: 'denied', reason: error.message, executed: false });
      throw error;
    }
  }
  function validate(state) {
    if (state.validationAttempts >= 3) throw new Error('LIMIT: at most 3 validation attempts');
    state.validationAttempts += 1;
    const snapshot = inspectArtifacts(root);
    const ok = Boolean(rules.acceptValidation(snapshot.checks));
    state.validation = { ok, hash: snapshot.hash };
    store.save(state);
    const result = { ...snapshot, ok, remaining: 3 - state.validationAttempts };
    store.emit({ event: 'validation', sessionId: state.sessionId, ...result });
    return result;
  }
  async function perform(name, args, context) {
    const state = store.get(context.sessionID);
    state.executed += 1;
    store.save(state);
    try {
      if (name === 'quest_status') return { ...state, level: settings.level, budget: settings.budget };
      if (name === 'quest_read') return { content: readLab(root, args.path) };
      if (name === 'quest_write') {
        // The non-negotiable boundary also applies before student rules are completed.
        const rel = safePath(root, args.path).relative;
        if (rel.startsWith('lab/submissions/')) throw new Error('PATH: submissions are tool-owned');
        writeLab(root, rel, args.content);
        state.validation = null;
        store.save(state);
        store.emit({ event: 'file_written', sessionId: state.sessionId, path: rel });
        return { written: rel };
      }
      if (name === 'quest_probe') {
        writeLab(root, 'lab/probe/probe.txt', 'harmless tool probe');
        return { probe: 'executed' };
      }
      if (name === 'quest_validate') return validate(state);
      if (name === 'quest_submit') {
        if (settings.level < 6) throw new Error('SUBMIT: unlock at level 6');
        return await submitArtifact({ root, rules, store, state, context, requestedHash: args.artifactHash });
      }
      throw new Error('TOOL: unknown tool');
    } catch (error) {
      store.emit({ event: 'tool_error', sessionId: state.sessionId, tool: name, reason: error.message });
      throw error;
    }
  }
  function after(input, output) {
    if (input.tool.startsWith('quest_')) store.emit({ event: 'after', sessionId: input.sessionID,
      callId: input.callID, tool: input.tool, output: String(output.output).slice(0, 2000) });
  }
  return { before, after, perform, store, settings };
}
