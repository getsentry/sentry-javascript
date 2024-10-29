// preact does not support more modern TypeScript versions, which breaks our users that depend on older
// TypeScript versions. To fix this, we shim the types from preact to be any and remove the dependency on preact
// for types directly. This script is meant to be run after the build/npm/types-ts3.8 directory is created.

// Path: build/npm/types-ts3.8/global.d.ts

const fs = require('fs');
const path = require('path');

/**
 * This regex looks for preact imports we can replace and shim out.
 *
 * Example:
 * import { ComponentChildren, VNode } from 'preact';
 */
const preactImportRegex = /import\s*{\s*([\w\s,]+)\s*}\s*from\s*'preact'\s*;?/;

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
        const capture = preactImportRegex.exec(content);
        if (capture) {
          const groups = capture[1].split(',').map(s => s.trim());

          // This generates a shim snippet to replace the type imports from preact
          // It generates a snippet based on the capture groups of preactImportRegex.
          //
          // Example:
          //
          // import type { ComponentChildren, VNode } from 'preact';
          // becomes
          // type ComponentChildren: any;
          // type VNode: any;
          const snippet = groups.reduce((acc, curr) => {
            const searchableValue = curr.includes(' as ') ? curr.split(' as ')[1] : curr;

            // look to see if imported as value, then we have to use declare const
            if (content.includes(`typeof ${searchableValue}`)) {
              return `${acc}declare const ${searchableValue}: any;\n`;
            }

            // look to see if generic type like Foo<T>
            if (content.includes(`${searchableValue}<`)) {
              return `${acc}type ${searchableValue}<T> = any;\n`;
            }

            // otherwise we can just leave as type
            return `${acc}type ${searchableValue} = any;\n`;
          }, '');

          // we then can remove the import from preact
          const newContent = content.replace(preactImportRegex, '// replaced import from preact');

          // and write the new content to the file
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
