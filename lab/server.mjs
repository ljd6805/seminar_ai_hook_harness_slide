#!/usr/bin/env node
// Hook·Harness 실험실 라이브 서버.
// 실습 폴더에서 `opencode serve`를 띄우고, OpenCode 이벤트 스트림과 플러그인 기록(.quest/events.jsonl)을
// 하나의 SSE 스트림으로 합쳐 lab/index.html에 보냅니다. Node 내장 모듈만 사용합니다.
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initProject } from '../quest/lib/setup.mjs';
import { PRESETS, TOOLS, normalizeConfig, harnessSource, compileHarness } from './kit/harness-source.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const PORT = Number(option('--port', 4300));
const WORKSPACE = path.resolve(option('--workspace', path.join(repo, 'workshops', 'lab')));
const OPENCODE = option('--opencode', 'opencode');
const DEMO = args.includes('--demo');
// 실습 폴더 밖에서 쓰던 모델을 그대로 쓰기 위한 옵션입니다. 평소 쓰는 opencode.json 경로를 주면 OpenCode가 함께 읽습니다.
const MODEL = option('--model', process.env.LAB_MODEL || '');
const EXTRA_CONFIG = option('--opencode-config', '');
const isWindows = process.platform === 'win32';

// Windows의 opencode·npm은 보통 .cmd 파일이라 cmd.exe를 거쳐야 실행됩니다. cmd.exe는 명령줄을 다시 쪼개므로
// 공백·한글·괄호가 있는 경로는 직접 따옴표로 감싼 한 줄로 넘깁니다. .exe는 셸 없이 바로 실행합니다.
const winQuote = arg => /^[A-Za-z0-9_.:\\/=-]+$/.test(arg) ? arg : '"' + String(arg).replace(/"/g, '""') + '"';
function spawnTool(bin, argv, options) {
  if (!isWindows || /\.exe$/i.test(bin)) return spawn(bin, argv, options);
  return spawn([bin, ...argv].map(winQuote).join(' '), [], { ...options, shell: true });
}
// 드라이브 문자 대소문자, 8.3 짧은 이름, 연결 폴더가 달라도 같은 파일인지 비교합니다.
function samePath(a, b) {
  const real = p => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
  const x = real(a), y = real(b);
  return isWindows ? x.toLowerCase() === y.toLowerCase() : x === y;
}

export { PRESETS };

function log(...parts) { console.log('[lab]', ...parts); }

// ---------- 실습 폴더 ----------
const questDir = path.join(WORKSPACE, '.quest');
const labConfigFile = path.join(questDir, 'lab-config.json');
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };

function prepareWorkspace() {
  if (!fs.existsSync(WORKSPACE)) {
    log('실습 폴더를 만듭니다:', WORKSPACE);
    initProject(WORKSPACE, 6, true);
  }
  // 플러그인은 @opencode-ai/plugin에서 tool()만 씁니다. npm 설치 대신 저장소에 들어 있는 사본을 연결하므로
  // 사내 npm 미러에 패키지가 없거나 경로에 공백·한글이 있어도 설치 단계가 없습니다.
  const pluginDir = path.join(WORKSPACE, '.opencode');
  const vendorDir = path.join(pluginDir, 'lab-vendor');
  fs.mkdirSync(vendorDir, { recursive: true });
  for (const name of ['zod.mjs', 'plugin-tool.mjs']) fs.copyFileSync(path.join(here, 'vendor', name), path.join(vendorDir, name));
  // Harness 코드(plugins/harness.js)가 쓰는 실습 환경: 작업 도구·세션 횟수·기록 파일.
  const kitDir = path.join(pluginDir, 'lab-kit');
  fs.mkdirSync(kitDir, { recursive: true });
  fs.copyFileSync(path.join(here, 'kit', 'kit.mjs'), path.join(kitDir, 'kit.mjs'));
  // OpenCode는 시작할 때 node_modules에 @opencode-ai/plugin이 없으면 npm으로 받으려 하고, 사내망에서는
  // 실패하거나 재시도로 수십 초를 기다립니다. 같은 이름의 작은 패키지를 두어 설치 단계를 건너뜁니다.
  const stubDir = path.join(pluginDir, 'node_modules', '@opencode-ai', 'plugin');
  if (!fs.existsSync(path.join(stubDir, 'package.json'))) {
    fs.mkdirSync(stubDir, { recursive: true });
    fs.writeFileSync(path.join(stubDir, 'package.json'), JSON.stringify({ name: '@opencode-ai/plugin', version: '1.19.4',
      type: 'module', exports: { '.': './index.js' }, description: 'lab stub: re-exports lab-vendor/plugin-tool.mjs' }, null, 2) + '\n');
    fs.writeFileSync(path.join(stubDir, 'index.js'), "export { tool } from '../../../lab-vendor/plugin-tool.mjs';\n");
  }
  // OpenCode는 package-lock.json에 @opencode-ai/plugin이 적혀 있어야 설치가 끝난 것으로 봅니다.
  const lockFile = path.join(pluginDir, 'package-lock.json');
  if (!readJson(lockFile, {})?.packages?.['']?.dependencies?.['@opencode-ai/plugin'])
    fs.writeFileSync(lockFile, JSON.stringify({ name: 'opencode-lab', lockfileVersion: 3, requires: true, packages: {
      '': { dependencies: { '@opencode-ai/plugin': '1.19.4' } },
      'node_modules/@opencode-ai/plugin': { version: '1.19.4' } } }, null, 2) + '\n');
  // 예전 실험실(rules.mjs 방식) 설정이면 기본 과정의 완성 Harness로 바꿉니다.
  if (typeof readJson(labConfigFile, {}).source !== 'string') writeConfig({ mode: 'basic', config: PRESETS.full });
}
// 실험실 상태를 실습 폴더에 씁니다. Harness 코드는 .opencode/plugins/harness.js 한 파일이고,
// 기본 과정은 폼 설정으로 만든 코드, 고급 과정은 사용자가 직접 쓴 코드를 그대로 씁니다.
function writeConfig({ mode, config, source }) {
  const settingsConfig = normalizeConfig(config);
  const code = mode === 'advanced' ? source : harnessSource(settingsConfig).source;
  fs.mkdirSync(questDir, { recursive: true });
  fs.writeFileSync(labConfigFile, JSON.stringify({ mode, config: settingsConfig, source: code }, null, 2));
  fs.writeFileSync(path.join(WORKSPACE, '.opencode', 'plugins', 'harness.js'), code);
  const settingsFile = path.join(questDir, 'settings.json');
  const settings = readJson(settingsFile, {});
  fs.writeFileSync(settingsFile, JSON.stringify({ ...settings, level: 6, budget: settingsConfig.budget,
    runId: crypto.randomUUID() }, null, 2) + '\n');
  const ocFile = path.join(WORKSPACE, 'opencode.json');
  const oc = readJson(ocFile, {});
  oc.agent.quest.permission.quest_publish = settingsConfig.approval;
  fs.writeFileSync(ocFile, JSON.stringify(oc, null, 2));
  return { mode, config: settingsConfig, source: code };
}
function resetOutputs() {
  for (const dir of ['lab/output', 'lab/submissions', 'lab/probe', 'lab/output-other']) {
    const target = path.join(WORKSPACE, dir);
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
  }
  fs.rmSync(path.join(questDir, 'states'), { recursive: true, force: true });
}

const relayAgent = data => broadcast('opencode', data);

// ---------- 브라우저 SSE ----------
const clients = new Set();
const history = [];
function broadcast(kind, data) {
  const message = { kind, data, at: Date.now() };
  history.push(message);
  if (history.length > 400) history.shift();
  const line = 'data: ' + JSON.stringify(message) + '\n\n';
  for (const res of clients) res.write(line);
}

// ---------- OpenCode 프로세스 ----------
let oc = null, ocUrl = null, ocState = 'stopped', fixture = null, eventAbort = null;
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
const query = () => '?directory=' + encodeURIComponent(WORKSPACE);
async function ocApi(route, body, method) {
  const response = await fetch(ocUrl + route + query(), {
    method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  if (!response.ok) throw new Error(route + ' ' + response.status + ' ' + text.slice(0, 300));
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}
function setState(state, detail) { ocState = state; broadcast('status', { state, detail }); }

async function applyDemoProvider() {
  const { fixtureProvider } = await import('../quest/tests/fixture-provider.mjs');
  fixture ??= await fixtureProvider();
  const file = path.join(WORKSPACE, 'opencode.json');
  const config = readJson(file, {});
  config.model = 'quest-fixture/fixture';
  config.small_model = config.model;
  config.provider = { 'quest-fixture': { npm: '@ai-sdk/openai-compatible', name: 'Scripted demo (not an LLM)',
    options: { baseURL: fixture.url, apiKey: 'local-fixture-not-a-secret' },
    models: { fixture: { name: 'Demo fixture', limit: { context: 32000, output: 4096 } } } } };
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
}

// --demo로 한 번 실행하면 실습 폴더 opencode.json에 데모 공급자가 남습니다. 실제 모델로 실행할 때는 지우고,
// --model을 주었으면 그 모델을 기본값으로 씁니다.
function applyLiveModel() {
  const file = path.join(WORKSPACE, 'opencode.json');
  const config = readJson(file, {});
  if (config.provider) delete config.provider['quest-fixture'];
  if (config.provider && !Object.keys(config.provider).length) delete config.provider;
  for (const key of ['model', 'small_model']) if (String(config[key] || '').startsWith('quest-fixture/')) delete config[key];
  if (MODEL) config.model = MODEL;
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
}

async function startOpenCode() {
  if (DEMO) await applyDemoProvider(); else applyLiveModel();
  setState('starting', 'OpenCode를 시작합니다');
  const port = await freePort();
  ocUrl = 'http://127.0.0.1:' + port;
  const env = { ...process.env, OPENCODE_DISABLE_AUTOUPDATE: '1' };
  if (EXTRA_CONFIG) env.OPENCODE_CONFIG = path.resolve(EXTRA_CONFIG);
  oc = spawnTool(OPENCODE, ['serve', '--hostname', '127.0.0.1', '--port', String(port)],
    { cwd: WORKSPACE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const child = oc;
  const relay = chunk => String(chunk).split('\n').filter(Boolean).forEach(text => broadcast('oclog', text));
  child.stdout.on('data', relay);
  child.stderr.on('data', relay);
  child.on('exit', code => { if (oc === child) { oc = null; setState('stopped', 'OpenCode가 종료되었습니다 (code ' + code + ')'); } });
  child.on('error', error => { if (oc === child) { oc = null; setState('error', 'OpenCode를 실행하지 못했습니다: ' + error.message); } });
  for (let i = 0; i < 240 && oc === child; i++) {
    try {
      const response = await fetch(ocUrl + '/global/health', { signal: AbortSignal.timeout(3000) });
      if (response.ok) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (oc !== child) return;
  subscribeEvents();
  // 인스턴스(플러그인 포함)를 미리 띄워 첫 요청의 대기를 줄입니다.
  try { await ocApi('/config'); } catch {}
  setState('ready', DEMO ? '데모 응답기(고정 시나리오)로 연결됨' : 'OpenCode 연결됨');
}
async function stopOpenCode() {
  eventAbort?.abort();
  const child = oc;
  oc = null;
  if (!child) return;
  await new Promise(resolve => {
    child.once('exit', resolve);
    if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    else child.kill('SIGTERM');
    setTimeout(resolve, 4000);
  });
}
async function restartOpenCode() { session = null; await stopOpenCode(); await startOpenCode(); }

const RELAY = new Set(['session.status', 'session.idle', 'session.error', 'message.part.updated',
  'message.part.delta', 'permission.asked', 'permission.replied', 'message.updated']);
const userMessages = new Set();
async function subscribeEvents() {
  eventAbort?.abort();
  const controller = new AbortController();
  eventAbort = controller;
  try {
    const response = await fetch(ocUrl + '/event' + query(), { signal: controller.signal });
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let index;
      while ((index = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('');
        if (!data) continue;
        const event = JSON.parse(data);
        if (!RELAY.has(event.type)) continue;
        const p = event.properties || {};
        if (session && p.sessionID && p.sessionID !== session) continue;
        if (event.type === 'message.updated') {
          if (p.info?.role === 'user') userMessages.add(p.info.id);
          // 오류가 있을 때만 전달합니다.
          if (p.info?.error) relayAgent({ type: 'session.error', properties: { error: p.info.error } });
          continue;
        }
        if (event.type === 'message.part.updated') {
          const part = p.part || {};
          if (part.type === 'tool') relayAgent({ type: 'tool', tool: part.tool, callID: part.callID,
            status: part.state?.status, input: part.state?.input, error: part.state?.error,
            output: typeof part.state?.output === 'string' ? part.state.output.slice(0, 400) : undefined });
          else if (part.type === 'text' && part.text && !part.synthetic && !userMessages.has(part.messageID))
            relayAgent({ type: 'text', id: part.id, messageID: part.messageID, text: part.text });
          continue;
        }
        relayAgent(event);
      }
    }
  } catch (error) {
    if (!controller.signal.aborted) broadcast('oclog', '이벤트 스트림 끊김: ' + error.message);
  }
}

// ---------- 플러그인 기록 tail ----------
const eventsFile = path.join(questDir, 'events.jsonl');
let offset = fs.existsSync(eventsFile) ? fs.statSync(eventsFile).size : 0;
// Hook 기록은 OpenCode 이벤트보다 늦게 도착하면 화면 순서가 뒤집히므로 자주 읽습니다.
function tail() {
  let size;
  try { size = fs.statSync(eventsFile).size; } catch { return; }
  if (size < offset) offset = 0;
  if (size === offset) return;
  const fd = fs.openSync(eventsFile, 'r');
  const buffer = Buffer.alloc(size - offset);
  fs.readSync(fd, buffer, 0, buffer.length, offset);
  fs.closeSync(fd);
  const text = buffer.toString('utf8');
  const last = text.lastIndexOf('\n');
  if (last < 0) return;
  offset += Buffer.byteLength(text.slice(0, last + 1));
  for (const line of text.slice(0, last).split('\n')) {
    try { broadcast('hook', JSON.parse(line)); } catch {}
  }
}
setInterval(tail, 30);

// ---------- 세션·요청 ----------
let session = null;
async function sendPrompt({ text, model, newSession }) {
  if (ocState !== 'ready') throw new Error('OpenCode가 아직 준비되지 않았습니다');
  if (newSession || !session) {
    const created = await ocApi('/session', { title: 'Hook·Harness 실험실' });
    session = created.id;
    broadcast('session', { id: session });
  }
  const body = { agent: 'quest', parts: [{ type: 'text', text }] };
  if (model && model.includes('/')) {
    const [providerID, ...rest] = model.split('/');
    body.model = { providerID, modelID: rest.join('/') };
  }
  await ocApi('/session/' + session + '/prompt_async', body);
  return { session };
}
const extraConfigPath = () => EXTRA_CONFIG ? path.resolve(EXTRA_CONFIG) : (process.env.OPENCODE_CONFIG || null);
async function listModels() {
  if (DEMO) return { models: ['quest-fixture/fixture'], default: 'quest-fixture/fixture' };
  const data = await ocApi('/config/providers');
  const models = [];
  for (const provider of data.providers || [])
    for (const id of Object.keys(provider.models || {})) models.push(provider.id + '/' + id);
  const fallback = Object.entries(data.default || {})[0];
  const configured = readJson(path.join(WORKSPACE, 'opencode.json'), {}).model;
  const chosen = configured || (fallback ? fallback[0] + '/' + fallback[1] : models[0]);
  if (chosen && !models.includes(chosen)) models.unshift(chosen);
  return { models, default: chosen, extraConfig: extraConfigPath() };
}

// ---------- HTTP ----------
const readBody = async req => { let body = ''; for await (const chunk of req) body += chunk; return body ? JSON.parse(body) : {}; };
const send = (res, status, value) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
const STATIC = { '/': 'lab/index.html', '/lab/': 'lab/index.html', '/lab/index.html': 'lab/index.html' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.woff2': 'font/woff2', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/info') return send(res, 200, { live: true, demo: DEMO, workspace: WORKSPACE, state: ocState,
      session, lab: readJson(labConfigFile, null), tools: TOOLS });
    if (url.pathname === '/api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write('data: ' + JSON.stringify({ kind: 'status', data: { state: ocState } }) + '\n\n');
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => { clients.delete(res); clearInterval(ping); });
      return;
    }
    if (url.pathname === '/api/models') return send(res, 200, await listModels());
    if (req.method === 'POST' && url.pathname === '/api/prompt') return send(res, 200, await sendPrompt(await readBody(req)));
    if (req.method === 'POST' && url.pathname === '/api/session/new') { session = null; return send(res, 200, { ok: true }); }
    if (req.method === 'POST' && url.pathname === '/api/abort') {
      if (session) await ocApi('/session/' + session + '/abort', {});
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/permission') {
      const { id, reply } = await readBody(req);
      if (!['once', 'reject'].includes(reply)) return send(res, 400, { error: 'reply must be once or reject' });
      await ocApi('/permission/' + id + '/reply', { reply });
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/config') {
      const body = await readBody(req);
      const mode = body.mode === 'advanced' ? 'advanced' : 'basic';
      if (mode === 'advanced') {
        if (typeof body.source !== 'string' || !body.source.trim()) return send(res, 400, { error: '코드가 비어 있습니다' });
        try { compileHarness(body.source); } catch (error) { return send(res, 400, { error: '코드 오류: ' + error.message }); }
      }
      const lab = writeConfig({ mode, config: body.config || {}, source: body.source });
      if (body.resetOutputs) resetOutputs();
      setState('starting', '새 Harness로 OpenCode를 다시 시작합니다');
      send(res, 200, { ok: true, ...lab });
      broadcast('config', { mode, config: lab.config });
      restartOpenCode().catch(error => setState('error', error.message));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/reset') {
      resetOutputs(); session = null; broadcast('reset', {});
      return send(res, 200, { ok: true });
    }
    const file = STATIC[url.pathname] || (url.pathname.startsWith('/assets/') ? url.pathname.slice(1) : null);
    if (file) {
      const target = path.join(repo, file);
      if (!target.startsWith(repo) || !fs.existsSync(target)) return send(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': TYPES[path.extname(target)] || 'application/octet-stream' });
      return fs.createReadStream(target).pipe(res);
    }
    if (url.pathname.startsWith('/docs/')) { res.writeHead(302, { location: 'https://ljd6805.github.io/seminar_ai_hook_harness_slide' + url.pathname }); return res.end(); }
    send(res, 404, { error: 'not found' });
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});

if (process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url))) {
  prepareWorkspace();
  server.listen(PORT, '127.0.0.1', () => {
    log('실험실: http://127.0.0.1:' + PORT + '/');
    log('실습 폴더: ' + WORKSPACE + (DEMO ? '  (데모 응답기 사용)' : ''));
  });
  startOpenCode().catch(error => setState('error', error.message));
  const shutdown = async () => { await stopOpenCode(); fixture?.server.close(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
