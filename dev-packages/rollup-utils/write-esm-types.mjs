/**
 * Writes every `.d.mts` file that the `exports` map of `./package.json` references. Each one re-exports the
 * `.d.ts` file next to it.
 *
 * TypeScript reads our `.d.ts` files as CommonJS, so for the `import` condition it allows
 * `import Sentry from '@sentry/<package>'`, although the ESM build has no default export.
 * The `.d.mts` file is an ESM module, so TypeScript reports the missing default export.
 *
 * Run it in the package directory after `tsc` has emitted the declarations.
 */
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_EXPORT_REGEX = /^export (?:default\b|(?:declare )?\{[^}]*\b(?:as default|default\s*[,}]))/m;

function collectDtsMtsPaths(exportsValue, paths = new Set()) {
  if (typeof exportsValue === 'string') {
    if (exportsValue.endsWith('.d.mts')) {
      paths.add(exportsValue);
    }
  } else if (exportsValue && typeof exportsValue === 'object') {
    Object.values(exportsValue).forEach(value => collectDtsMtsPaths(value, paths));
  }

  return paths;
}

const packageJSON = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

for (const dtsMtsPath of collectDtsMtsPaths(packageJSON.exports)) {
  const baseName = path.basename(dtsMtsPath, '.d.mts');
  const dtsPath = path.join(path.dirname(dtsMtsPath), `${baseName}.d.ts`);

  // `export *` does not re-export `default`, so the ESM types of this entry would lose it.
  if (DEFAULT_EXPORT_REGEX.test(fs.readFileSync(dtsPath, 'utf-8'))) {
    throw new Error(`${dtsPath} has a default export, which the generated ${dtsMtsPath} cannot re-export.`);
  }

  fs.writeFileSync(dtsMtsPath, `export * from './${baseName}.js';\n`);
}
