import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { initProject } from '../lib/setup.mjs';
import { gradeProject } from '../lib/grader.mjs';
import { fixtureProvider } from '../tests/fixture-provider.mjs';
import { unusedPort, apiClient, waitReady, runSession } from '../tests/native-client.mjs';

const [bin, modules] = process.argv.slice(2);
if (!bin || !modules) throw new Error('Usage: node quest/scripts/opencode-smoke.mjs <opencode-bin> <installed-node_modules>');
const version=execFileSync(path.resolve(bin),['--version'],{encoding:'utf8'}).trim();
assert.equal(version,'1.19.4','This fixture targets the pinned reference version');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'quest-opencode-'));
const root=path.join(temporary,'course');initProject(root,6,true);
fs.symlinkSync(path.resolve(modules),path.join(root,'.opencode/node_modules'),'dir');
const fixture=await fixtureProvider();
const configPath=path.join(root,'opencode.json');
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
config.model='quest-fixture/fixture'; config.small_model=config.model;
config.provider={'quest-fixture':{npm:'@ai-sdk/openai-compatible',name:'Scripted integration fixture',
  options:{baseURL:fixture.url,apiKey:'local-fixture-not-a-secret'},
  models:{fixture:{name:'Fixture',limit:{context:32000,output:4096}}}}};
fs.writeFileSync(configPath,JSON.stringify(config,null,2));
const port=await unusedPort();
const child=spawn(path.resolve(bin),['serve','--hostname','127.0.0.1','--port',String(port)],{
  cwd:root,env:{...process.env,XDG_CONFIG_HOME:path.join(temporary,'config'),
    XDG_DATA_HOME:path.join(temporary,'data'),XDG_CACHE_HOME:path.join(temporary,'cache')},
  stdio:['ignore','pipe','pipe'],
});
let logs='';child.stdout.on('data',b=>{logs+=b;});child.stderr.on('data',b=>{logs+=b;});
const api=apiClient('http://127.0.0.1:'+port,root);
try {
  await waitReady(api,child);
  const sessions=[];
  sessions.push(await runSession(api,'normal-rejected','reject'));
  sessions.push(await runSession(api,'normal-approved','once'));
  for(const scenario of ['probe-only','path-only','limit-only']) sessions.push(await runSession(api,scenario));
  const events=fs.readFileSync(path.join(root,'.quest/events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(events.some(e=>e.event==='after'));
  assert.ok(events.some(e=>e.event==='approval_rejected'));
  assert.equal(events.filter(e=>e.event==='submitted').length,1);
  assert.ok(events.some(e=>e.event==='denied'&&e.reason.includes('path denied')));
  assert.ok(events.some(e=>e.event==='denied'&&e.reason.includes('budget')));
  assert.ok(events.some(e=>e.event==='denied'&&e.tool==='quest_probe'));
  assert.equal(fs.readdirSync(path.join(root,'lab/submissions')).length,1);
  const grade=await gradeProject(root,true);
  assert.equal(grade.localPassed,true);
  assert.equal(grade.livePassed,true);
  const result={status:'PASS',type:'real OpenCode engine + scripted provider + programmatic approval',
    opencodeVersion:version,nodeVersion:process.version,platform:process.platform,
    realLLM:false,humanUI:false,root,sessions,events:events.length,requests:fixture.requests.length,grade};
  fs.writeFileSync(path.join(temporary,'result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} catch(error) {
  fs.writeFileSync(path.join(temporary,'server.log'),logs);
  console.error('FAIL. Evidence at '+temporary+'\n'+error.stack);process.exitCode=1;
} finally { child.kill('SIGTERM'); fixture.server.close(); }
