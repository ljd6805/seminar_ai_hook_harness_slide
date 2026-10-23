import { inspectArtifacts } from './validation.mjs';
import { writeLab } from './files.mjs';

function facts(state, snapshot, requestedHash) {
  return {
    valid: state.validation?.ok === true,
    sameHash: state.validation?.hash === snapshot.hash && requestedHash === snapshot.hash,
    consumed: state.consumed,
    attemptsAllowed: state.validationAttempts <= 3,
  };
}
export async function submitArtifact({ root, rules, store, state, context, requestedHash }) {
  const before = inspectArtifacts(root);
  if (!rules.canSubmit(facts(state, before, requestedHash))) throw new Error('SUBMIT: invalid or stale validation');
  store.emit({ event: 'approval_requested', sessionId: state.sessionId, artifactHash: before.hash });
  try {
    await context.ask({ permission: 'quest_publish', patterns: [before.hash], always: [],
      metadata: { artifactHash: before.hash, files: ['lab/output/summary.json', 'lab/output/report.md'] } });
  } catch (error) {
    store.emit({ event: 'approval_rejected', sessionId: state.sessionId, artifactHash: before.hash });
    throw error;
  }
  if (context.abort?.aborted) throw new Error('SUBMIT: cancelled');
  const after = inspectArtifacts(root);
  if (!rules.canSubmit(facts(state, after, requestedHash)) || before.hash !== after.hash)
    throw new Error('SUBMIT: files changed during approval');
  const receipt = { sessionId: state.sessionId, artifactHash: after.hash, submittedAt: new Date().toISOString() };
  writeLab(root, 'lab/submissions/' + after.hash + '.json', JSON.stringify(receipt, null, 2), true);
  state.consumed = true;
  store.save(state);
  store.emit({ event: 'submitted', sessionId: state.sessionId, artifactHash: after.hash });
  return receipt;
}
