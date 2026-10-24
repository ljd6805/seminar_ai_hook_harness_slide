import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixture, driver } from './helpers.mjs';
import { safePath, writeLab, readLab } from '../lib/files.mjs';
import { gradeRules, gradeEvidence } from '../lib/grader.mjs';
import { checkpointSource } from '../lib/checkpoints.mjs';
import { applyCheckpoint } from '../lib/setup.mjs';
import * as rules from '../solutions/rules.mjs';

// Solutions are under quest/solutions; tests import the independent expected behavior.
test('path: prefix, traversal and absolute paths are refused; normal write succeeds', async t => {
  const root = fixture(t), d = driver(root);
  await d.call('quest_write', { path:'lab/output/a.txt', content:'ok' });
  for (const p of ['lab/input/orders.json','lab/output-other/a.txt','lab/output/../protected/a.txt'])
    await assert.rejects(d.call('quest_write',{path:p,content:'bad'}), /path denied/);
  for (const p of ['../outside','/tmp/x','C:/x','lab/../../x']) assert.throws(() => safePath(root,p), /PATH/);
  assert.equal(readLab(root,'lab/output/a.txt'),'ok');
});
test('symlink and dangling symlink writes are refused', t => {
  const root = fixture(t);
  fs.symlinkSync(path.join(root,'lab/protected'),path.join(root,'lab/output/link'),'dir');
  assert.throws(()=>writeLab(root,'lab/output/link/x','bad'),/symlink/);
  fs.symlinkSync(path.join(root,'missing'),path.join(root,'lab/output/dangling'));
  assert.throws(()=>writeLab(root,'lab/output/dangling','bad'),/symlink/);
});
test('tool policy rejects probe but normal read still runs', async t => {
  const d=driver(fixture(t));
  await assert.rejects(d.call('quest_probe'),/tool denied/);
  assert.match((await d.call('quest_read',{path:'lab/input/orders.json'})).content,/discount/);
});
test('budget includes denied attempts and is isolated by session', async t => {
  const root=fixture(t),d=driver(root);
  for(let i=0;i<8;i++) await assert.rejects(d.call('quest_probe'),/tool denied/);
  await assert.rejects(d.call('quest_read',{path:'lab/input/orders.json'}),/budget/);
  const next=driver(root,{session:'new-session'});
  assert.ok(await next.call('quest_read',{path:'lab/input/orders.json'}));
});
test('simultaneous reservations never allow a ninth operation', async t => {
  const d=driver(fixture(t));
  const results=await Promise.allSettled(Array.from({length:12},()=>d.call('quest_read',{path:'lab/input/orders.json'})));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,8);
});
test('all solutions pass, each current starter fails, checkpoints preserve previous source', async t => {
  assert.ok(gradeRules(rules,6).every(c=>c.pass));
  for(let level=1;level<=6;level++){
    const source=checkpointSource(level);
    const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
    assert.ok(gradeRules(module,level).some(c=>!c.pass),'starter level '+level);
  }
  const root=fixture(t);const original=fs.readFileSync(path.join(root,'learner/rules.mjs'),'utf8');
  const backup=applyCheckpoint(root,2);
  assert.equal(fs.readFileSync(path.join(root,backup),'utf8'),original);
});
test('unit-test events cannot pass the actual OpenCode evidence gate', async t => {
  const root=fixture(t),d=driver(root);
  await d.call('quest_read',{path:'lab/input/orders.json'});
  const checks=gradeEvidence(root,d.runtime.settings);
  assert.ok(checks.some(c=>!c.pass));
});
