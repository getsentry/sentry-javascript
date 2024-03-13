// preact does not support more modern TypeScript versions, which breaks our users that depend on older
// TypeScript versions. To fix this, we alias preact module to a shim for our <4.9 TS users.

// Path: build/npm/types-ts3.8/global.d.ts

const fs = require('fs');
const path = require('path');

const snippet = `type VNode = any;
type ComponentChildren = any;
type ComponentType<T> = any;
declare const hType: any;
`

const preactImportRegex = /import\s*{\s*([\w\s,]+)\s*}\s*from\s*'preact'\s*;?/g;

function walk(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.lstatSync(filePath);
    if (stat.isDirectory()) {
      walk(filePath);
    } else {
      if (filePath.endsWith('.d.ts')) {
        const content = fs.readFileSync(filePath, 'utf8');
        if (preactImportRegex.test(content)) {
          const newContent = content.replace(preactImportRegex, '// replaced import from preact');
          fs.writeFileSync(filePath, snippet + newContent, 'utf8');
        }
      }
    }
  });
}

function run() {
  // recurse through build/npm/types-ts3.8 directory
  const dir = path.join('build', 'npm', 'types-ts3.8');
  walk(dir);
}

run();
