import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

export async function unusedPort() {
  const server=net.createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}
export function apiClient(url, directory) {
  return async function api(route, body) {
    const response = await fetch(url + route + '?directory=' + encodeURIComponent(directory), {
      method:body ? 'POST' : 'GET', headers:{'content-type':'application/json'},
      body:body ? JSON.stringify(body) : undefined,
      signal:AbortSignal.timeout(60000),
    });
    if (!response.ok) throw new Error(route + ': ' + response.status + ' ' + await response.text());
    return response.json();
  };
}
export async function waitReady(api, child) {
  for(let i=0;i<80;i++) {
    if(child.exitCode!==null) throw new Error('OpenCode exited before readiness');
    try { await api('/global/health'); return; } catch {}
    await delay(250);
  }
  throw new Error('OpenCode readiness timeout');
}
export async function runSession(api, scenario, reply = 'reject') {
  const session=await api('/session', {title:'Harness engine fixture: '+scenario});
  let finished=false, response, failure, seenPermission=false;
  const prompt=api('/session/'+session.id+'/message', {
    agent:'quest',model:{providerID:'quest-fixture',modelID:'fixture'},
    parts:[{type:'text',text:scenario}],
  }).then(r=>{response=r;}).catch(e=>{failure=e;}).finally(()=>{finished=true;});
  for(let i=0;i<200&&!finished;i++) {
    const requests=await api('/permission');
    for(const request of requests.filter(r=>r.sessionID===session.id)) {
      if(request.permission!=='quest_publish') throw new Error('Unexpected permission: '+request.permission);
      if(!request.patterns.every(p=>/^[a-f0-9]{64}$/.test(p))) throw new Error('Unexpected approval pattern');
      seenPermission=true;
      await api('/permission/'+request.id+'/reply', {reply});
    }
    await delay(150);
  }
  await prompt;
  if(failure) throw failure;
  if(response.info?.error) throw new Error(JSON.stringify(response.info.error));
  return {sessionId:session.id,scenario,seenPermission,reply};
}
