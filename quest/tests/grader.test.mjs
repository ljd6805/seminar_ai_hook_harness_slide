import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';
import { appendEvent, readPrivate } from '../lib/files.mjs';
import { gradeEvidence } from '../lib/grader.mjs';

// Synthetic events test the grader only; these are never integration evidence.
function events(root, settings, runId = settings.runId) {
  for (const item of [
    {event:'plugin_loaded'},
    {event:'before',sessionId:'s',callId:'c',tool:'quest_read'},
    {event:'after',sessionId:'s',callId:'c',tool:'quest_read'},
    {event:'denied',tool:'quest_probe',reason:'POLICY: tool denied'},
  ]) appendEvent(root,{source:'opencode',runId,...item});
}
test('evidence requires the current checkpoint, without repeating earlier level missions', t => {
  const root=fixture(t), settings={...readPrivate(root,'settings.json'),level:3};
  events(root,settings);
  const checks=gradeEvidence(root,settings);
  assert.equal(checks.length,3);
  assert.ok(checks.every(c=>c.pass));
});
test('previous checkpoint evidence cannot satisfy a new checkpoint', t => {
  const root=fixture(t), settings={...readPrivate(root,'settings.json'),level:3};
  events(root,settings,'old-run');
  assert.ok(gradeEvidence(root,settings).every(c=>!c.pass));
});
