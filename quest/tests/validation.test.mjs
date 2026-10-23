import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixture, goodOutput, driver } from './helpers.mjs';
import { writeLab } from '../lib/files.mjs';

test('validator rejects missing and incorrect artifacts and accepts corrected files', async t=>{
  const root=fixture(t),d=driver(root);
  assert.equal((await d.call('quest_validate')).ok,false);
  goodOutput(root);
  writeLab(root,'lab/output/summary.json','{"currency":"KRW","itemCount":3,"total":15000}');
  assert.equal((await d.call('quest_validate')).ok,false);
  goodOutput(root); assert.equal((await d.call('quest_validate')).ok,true);
  await assert.rejects(d.call('quest_validate'),/at most 3/);
});
test('changed original and extra schema keys cannot pass', async t=>{
  const root=fixture(t),d=driver(root);goodOutput(root);
  writeLab(root,'lab/protected/settings.json','{}');
  assert.equal((await d.call('quest_validate')).ok,false);
  writeLab(root,'lab/output/summary.json','{"currency":"KRW","itemCount":3,"total":13000,"extra":1}');
  assert.equal((await d.call('quest_validate')).checks.schemaOK,false);
});
test('invalid validation cannot request approval', async t=>{
  let asks=0;const d=driver(fixture(t),{ask:async()=>{asks++;}});
  const v=await d.call('quest_validate');
  await assert.rejects(d.call('quest_submit',{artifactHash:v.hash}),/invalid/);
  assert.equal(asks,0);
});
test('native approval rejection creates no receipt', async t=>{
  const root=fixture(t);goodOutput(root);
  const d=driver(root,{ask:async()=>{throw new Error('human rejected');}});
  const v=await d.call('quest_validate');
  await assert.rejects(d.call('quest_submit',{artifactHash:v.hash}),/rejected/);
  assert.deepEqual(fs.readdirSync(path.join(root,'lab/submissions')),[]);
});
test('one approved matching artifact submits once; duplicate is rejected', async t=>{
  const root=fixture(t);goodOutput(root);let request;
  const d=driver(root,{ask:async r=>{request=r;}});
  const v=await d.call('quest_validate');
  const receipt=await d.call('quest_submit',{artifactHash:v.hash});
  assert.equal(receipt.artifactHash,v.hash);assert.deepEqual(request.patterns,[v.hash]);
  assert.deepEqual(request.always,[]);
  await assert.rejects(d.call('quest_submit',{artifactHash:v.hash}),/invalid/);
  assert.equal(fs.readdirSync(path.join(root,'lab/submissions')).length,1);
});
test('files changed before or during approval invalidate the request', async t=>{
  const root=fixture(t);goodOutput(root);
  const d=driver(root,{ask:async()=>writeLab(root,'lab/output/report.md','changed 13000')});
  const v=await d.call('quest_validate');
  await assert.rejects(d.call('quest_submit',{artifactHash:v.hash}),/changed|stale/);
  assert.deepEqual(fs.readdirSync(path.join(root,'lab/submissions')),[]);
  await assert.rejects(d.call('quest_submit',{artifactHash:v.hash}),/stale/);
});
test('validation from a different session is not reused', async t=>{
  const root=fixture(t);goodOutput(root);const a=driver(root),b=driver(root,{session:'other'});
  const v=await a.call('quest_validate');
  await assert.rejects(b.call('quest_submit',{artifactHash:v.hash}),/invalid/);
});
