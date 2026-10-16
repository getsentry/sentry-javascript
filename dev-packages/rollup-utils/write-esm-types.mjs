/**
 * Writes every `.d.mts` file that the `exports` map of `./package.json` references. Each one re-exports the
 * `.d.ts` file next to it.
 *
 * TypeScript reads our `.d.ts` files as CommonJS, so for the `import` condition it allows
 * `import Sentry from '@sentry/<package>'`, although the ESM build has no default export.
 * The `.d.mts` file is an ESM module, so TypeScript reports the missing default export.
 *
 * Run it in the package directory after `tsc` has emitted the declarations.
 * Pass folders (for example `build/module`) to write only the `.d.mts` files in them.
 */
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_EXPORT_REGEX = /^export (?:default\b|(?:declare )?\{[^}]*\b(?:as default|default\s*[,}]))/m;

function collectDtsMtsPaths(exportsValue, paths = new Set()) {
  if (typeof exportsValue === 'string') {
    if (exportsValue.endsWith('.d.mts')) {
      paths.add(path.normalize(exportsValue));
    }
  } else if (exportsValue && typeof exportsValue === 'object') {
    Object.values(exportsValue).forEach(value => collectDtsMtsPaths(value, paths));
  }

  return paths;
}

function esmTypes(baseName, hasDefaultExport) {
  const lines = [`export * from './${baseName}.js';`];

  // `export *` skips `default`, and `export { default } from` would give the whole CJS module under `nodenext`,
  // because TypeScript types the default import of a CJS file as `module.exports` there.
  if (hasDefaultExport) {
    lines.push(
      `import type * as cjs from './${baseName}.js';`,
      'type DefaultExport = typeof cjs extends { default: { default: infer D } } ? D : typeof cjs extends { default: infer D } ? D : never;',
      'declare const _default: DefaultExport;',
      'export default _default;',
    );
  }

  return `${lines.join('\n')}\n`;
}

const folders = process.argv.slice(2).map(folder => `${path.normalize(folder)}${path.sep}`);
const packageJSON = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

for (const dtsMtsPath of collectDtsMtsPaths(packageJSON.exports)) {
  if (folders.length && !folders.some(folder => dtsMtsPath.startsWith(folder))) {
    continue;
  }

  const baseName = path.basename(dtsMtsPath, '.d.mts');
  const dtsPath = path.join(path.dirname(dtsMtsPath), `${baseName}.d.ts`);
  const hasDefaultExport = DEFAULT_EXPORT_REGEX.test(fs.readFileSync(dtsPath, 'utf-8'));

  fs.writeFileSync(dtsMtsPath, esmTypes(baseName, hasDefaultExport));
}
