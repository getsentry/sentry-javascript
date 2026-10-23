// Temporary: prints what CI needs to explain the "not in the React Client
// Manifest" build failure. Runs after a failed `next build`.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

function section(title) {
  console.log(`\n=== ${title}`);
}

function walk(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

section('Environment');
console.log({
  platform: process.platform,
  arch: process.arch,
  machine: os.machine(),
  cpus: os.cpus().length,
  node: process.version,
  cwd: process.cwd(),
});

section('oxc-parser');
const pnpmDir = path.join('node_modules', '.pnpm');
const oxcDirs = fs.existsSync(pnpmDir) ? fs.readdirSync(pnpmDir).filter(name => name.includes('oxc-parser')) : [];
console.log('installed:', oxcDirs.length ? oxcDirs : '(none found in node_modules/.pnpm)');
try {
  const oxcDir = oxcDirs.find(name => name.startsWith('oxc-parser@'));
  const { parseSync } = createRequire(path.resolve(pnpmDir, oxcDir, 'node_modules/oxc-parser/package.json'))(
    'oxc-parser',
  );
  const source = fs.readFileSync('app/global-error.tsx', 'utf8');
  const { program, errors } = parseSync('global-error.tsx', source);
  console.log('loads: yes, parse errors:', errors.length);
  console.log(
    'directives:',
    program.body.filter(node => node.directive).map(node => node.directive),
  );
} catch (error) {
  console.log('loads: no', error);
}

section('Client reference manifest');
const manifest = '.next/server/app/_global-error/page_client-reference-manifest.js';
if (fs.existsSync(manifest)) {
  const content = fs.readFileSync(manifest, 'utf8');
  console.log(
    `${manifest}: ${content.length} bytes, "global-error" appears ${content.split('global-error').length - 1} times`,
  );
} else {
  console.log(`${manifest}: missing`);
}

section('Compiled global-error modules');
const clientMarker = '__next_internal_client_entry_do_not_use__';
let otherFiles = 0;
for (const file of [...walk('.next/server'), ...walk('.next/static/chunks')]) {
  if (!file.endsWith('.js') || file.endsWith('_client-reference-manifest.js')) {
    continue;
  }
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes('global-error')) {
    continue;
  }
  if (!file.includes('global-error')) {
    otherFiles++;
    continue;
  }
  console.log(`${file}: client entry marker ${content.includes(clientMarker) ? 'present' : 'absent'}`);
  const index = content.indexOf('global-error.tsx');
  console.log(
    `  near "global-error.tsx": ${content.slice(Math.max(0, index - 150), index + 150).replace(/\s+/g, ' ')}`,
  );
}
console.log(`${otherFiles} other files mention "global-error"`);
