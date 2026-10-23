import fs from 'node:fs';
import path from 'node:path';

const chunksDir = '.next/static/chunks';
const walk = dir =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });

console.log('readdir app:', fs.readdirSync('app').join(' '));

for (const file of walk(chunksDir)) {
  const src = fs.readFileSync(file, 'utf8');
  if (!/global-error|GlobalError|statusCode:0/.test(src) && !file.includes('global-error')) continue;
  const push = /\.push\(\[\[([^\]]*)\]/.exec(src);
  const ids = [...src.matchAll(/[,{](\d+):(?:\(|function)/g)].map(m => m[1]);
  console.log('CHUNK', file, 'chunkIds', push?.[1], 'modules', ids.join(' '), 'size', src.length);
  const entry = /\.O\(0,\[([^\]]*)\],\(\)=>[^)]*\((\d+)\)\)/.exec(src);
  if (entry) console.log('  entry deps', entry[1], 'entry module', entry[2]);
  const tail = src.slice(-400);
  console.log('  tail', tail);
}

const stats = '.next/server/app/_global-error/page.js';
const serverSrc = fs.readFileSync(stats, 'utf8');
for (const m of serverSrc.matchAll(/[^"'`]{0,120}global-error[^"'`]{0,120}/g)) {
  console.log('SERVER REF', m[0]);
}
