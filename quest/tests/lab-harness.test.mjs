import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, STARTER, MISSIONS, harnessSource, probeHarness } from '../../lab/kit/harness-source.mjs';

test('기본 과정의 완성 Harness 코드는 미션을 모두 통과한다', async () => {
  const result = await probeHarness(harnessSource(PRESETS.full).source);
  assert.equal(result.error, null);
  assert.deepEqual(MISSIONS.filter(m => !result.missions[m.id].pass).map(m => m.id), []);
  assert.deepEqual(result.info, { record: true, toolsOn: true, pathOn: true, limitOn: true, budget: 8, checksAll: true });
});

test('설정을 끄면 그 코드가 사라지고 동작도 사라진다', async () => {
  const off = harnessSource({ ...PRESETS.full, limitOn: false, pathOn: false, record: false });
  assert.doesNotMatch(off.source, /LIMIT: tool request budget/);
  assert.doesNotMatch(off.source, /path denied/);
  assert.ok(!off.regions.includes('limit') && !off.regions.includes('paths'));
  const result = await probeHarness(off.source);
  assert.deepEqual([result.info.limitOn, result.info.pathOn, result.info.record], [false, false, false]);
  assert.equal(result.info.toolsOn, true);
});

test('예산을 바꾸면 코드의 숫자와 실제로 막는 시점이 함께 바뀐다', async () => {
  const result = await probeHarness(harnessSource({ ...PRESETS.full, budget: 3 }).source);
  assert.equal(result.info.budget, 3);
});

test('고급 과정 뼈대는 Hook 등록만 통과하고, 문법 오류는 알려 준다', async () => {
  const start = await probeHarness(STARTER);
  assert.equal(start.missions.hook.pass, true);
  assert.equal(Object.values(start.missions).filter(m => m.pass).length, 1);
  const broken = await probeHarness('export const X = async () => { return {');
  assert.match(broken.error, /문법 오류/);
});
