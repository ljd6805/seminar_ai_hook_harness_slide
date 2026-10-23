import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const hash = text => createHash('sha256').update(text).digest('hex');
export function safePath(root, relative, prefix = 'lab') {
  if (typeof relative !== 'string' || relative.includes('\\') || relative.includes('\0'))
    throw new Error('PATH: use a relative slash-separated path');
  if (path.isAbsolute(relative) || /^[A-Za-z]:/.test(relative)) throw new Error('PATH: absolute path');
  const base = fs.realpathSync(root);
  const target = path.resolve(base, relative);
  const normalized = path.relative(base, target).split(path.sep).join('/');
  if (!normalized.startsWith(prefix + '/')) throw new Error('PATH: outside permitted root');
  let cursor = base;
  for (const part of normalized.split('/')) {
    cursor = path.join(cursor, part);
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw new Error('PATH: symlink');
    try { if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('PATH: symlink'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { target, relative: normalized };
}
export function readLab(root, relative) {
  const { target } = safePath(root, relative);
  const stat = fs.statSync(target);
  if (!stat.isFile() || stat.size > 128 * 1024) throw new Error('FILE: regular file <=128 KiB required');
  return fs.readFileSync(target, 'utf8');
}
export function writeLab(root, relative, content, exclusive = false) {
  if (typeof content !== 'string' || Buffer.byteLength(content) > 128 * 1024)
    throw new Error('FILE: content must be a string <=128 KiB');
  const { target } = safePath(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, { flag: exclusive ? 'wx' : 'w' });
}
export function readPrivate(root, relative) {
  return JSON.parse(fs.readFileSync(safePath(root, '.quest/' + relative, '.quest').target, 'utf8'));
}
export function writePrivate(root, relative, value) {
  const { target } = safePath(root, '.quest/' + relative, '.quest');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value, null, 2) + '\n');
}
export function appendEvent(root, event) {
  const { target } = safePath(root, '.quest/events.jsonl', '.quest');
  fs.appendFileSync(target, JSON.stringify(event) + '\n');
}
