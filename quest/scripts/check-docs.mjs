import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const folder=path.resolve('docs');
const files=fs.readdirSync(folder).filter(f=>f.endsWith('.html'));
let links=0;
for(const file of files) {
  const absolute=path.join(folder,file), html=fs.readFileSync(absolute,'utf8');
  for(const token of ['<!doctype html','<html lang="ko"','<title>','<main','</html>'])
    assert.ok(html.toLowerCase().includes(token),file+' missing '+token);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length,file+' duplicate IDs');
  for(const [,href] of html.matchAll(/\bhref="([^"]+)"/g)) {
    if(/^[a-z]+:/i.test(href)) continue;
    const [relative,fragment]=href.split('#');
    const target=relative ? path.resolve(folder,relative.split('?')[0]) : absolute;
    assert.ok(fs.existsSync(target),file+' broken link '+href);
    if(fragment && target.endsWith('.html')) {
      const text=fs.readFileSync(target,'utf8');
      assert.ok(text.includes('id="'+fragment+'"'),file+' missing anchor '+href);
    }
    links++;
  }
}
console.log(`PASS: ${files.length} HTML documents; ${links} local links/anchors; required structure; unique IDs.`);
console.log('Not a browser layout, accessibility or print-rendering test.');
