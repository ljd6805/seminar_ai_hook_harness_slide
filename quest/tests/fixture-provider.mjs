import http from 'node:http';

function nextCall(messages) {
  const calls = messages.flatMap(m => m.tool_calls || []);
  const n = calls.length;
  const text = JSON.stringify(messages.filter(m => m.role === 'user'));
  if (text.includes('probe-only')) return n ? null : ['quest_probe', {}];
  if (text.includes('path-only')) return n ? null : ['quest_write', { path:'lab/protected/settings.json', content:'bad' }];
  if (text.includes('limit-only')) return n < 9 ? ['quest_read', { path:'lab/input/orders.json' }] : null;
  const pipeline = [
    ['quest_read', { path:'lab/input/orders.json' }],
    ['quest_write', { path:'lab/output/summary.json', content:'{"currency":"KRW","itemCount":3,"total":15000}' }],
    ['quest_write', { path:'lab/output/report.md', content:'# Report\nTotal: 13000 KRW' }],
    ['quest_validate', {}],
    ['quest_write', { path:'lab/output/summary.json', content:'{"currency":"KRW","itemCount":3,"total":13000}' }],
    ['quest_validate', {}],
  ];
  if (n < pipeline.length) return pipeline[n];
  if (n === pipeline.length) {
    const outputs = messages.filter(m => m.role === 'tool').map(m => m.content);
    const matches = [...JSON.stringify(outputs).matchAll(/hash\\?":\\?"([a-f0-9]{64})/g)];
    if (!matches.length) throw new Error('fixture did not find validation hash');
    return ['quest_submit', { artifactHash:matches.at(-1)[1] }];
  }
  return null;
}
export async function fixtureProvider() {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    try {
      const input = JSON.parse(body); requests.push({ path:req.url, tools:input.tools?.length || 0 });
      const call = input.tools?.length ? nextCall(input.messages) : null;
      const id = 'fixture-' + requests.length;
      const delta = call ? { role:'assistant', tool_calls:[{ index:0,id,type:'function',
        function:{ name:call[0],arguments:JSON.stringify(call[1]) } }] } :
        { role:'assistant',content:'Fixture complete. This response is scripted, not an LLM.' };
      res.writeHead(200, { 'content-type':'text/event-stream' });
      const chunk = (d, finish) => ({ id,object:'chat.completion.chunk',created:1,model:'fixture',
        choices:[{index:0,delta:d,finish_reason:finish}] });
      res.write('data: ' + JSON.stringify(chunk(delta,null)) + '\n\n');
      res.write('data: ' + JSON.stringify(chunk({},call ? 'tool_calls' : 'stop')) + '\n\n');
      res.end('data: [DONE]\n\n');
    } catch (error) { res.writeHead(500); res.end(JSON.stringify({error:error.message})); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, requests, url:'http://127.0.0.1:' + server.address().port + '/v1' };
}
