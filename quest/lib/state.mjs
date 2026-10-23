import fs from 'node:fs';
import { hash, readPrivate, writePrivate, appendEvent, safePath } from './files.mjs';

export function stateStore(root, settings, record, source) {
  const states = new Map();
  function get(sessionId) {
    const key = hash(settings.runId + ':' + sessionId);
    if (states.has(key)) return states.get(key);
    const file = 'states/' + key + '.json';
    const target = safePath(root, '.quest/' + file, '.quest').target;
    const state = fs.existsSync(target) ? readPrivate(root, file) : {
      sessionId, runId: settings.runId, attempted: 0, executed: 0,
      validationAttempts: 0, validation: null, consumed: false,
    };
    states.set(key, state);
    return state;
  }
  function save(state) {
    writePrivate(root, 'states/' + hash(settings.runId + ':' + state.sessionId) + '.json', state);
  }
  function emit(event, mandatory = false) {
    if (mandatory || record()) appendEvent(root, {
      time: new Date().toISOString(), source, runId: settings.runId, level: settings.level,
      ...event,
    });
  }
  return { get, save, emit };
}
