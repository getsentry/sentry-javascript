/**
 * Checks the types of every `@sentry/*` package with "Are the types wrong?" (attw), for Node's `require`, Node's
 * `import` and bundlers. It fails for every problem that is not in `KNOWN_PROBLEMS`, and for every entry in
 * `KNOWN_PROBLEMS` that attw does not report any more.
 */
import { checkPackage, Package } from '@arethetypeswrong/core';
import { problemAffectsEntrypointResolution } from '@arethetypeswrong/core/problems';
import fs from 'node:fs';
import path from 'node:path';
import { getPackageDir, getPackageJson, getPackageNames, getTypedEntries } from './entries.mjs';

const RESOLUTION_KINDS = ['node16-cjs', 'node16-esm', 'bundler'];

/** What attw reports for `require` of an entry that has no CJS build. */
const ESM_ONLY_PROBLEMS = new Set(['CJSResolvesToESM', 'NoResolution']);

/** Problems in the published packages that are not fixed yet. Keys are `<entry> <resolution kind> <problem kind>`. */
const KNOWN_PROBLEMS = {
  '@sentry/angular node16-cjs InternalResolutionError':
    'ng-packagr writes ESM declaration files with relative imports that have no file extension.',
  '@sentry/angular node16-esm InternalResolutionError':
    'ng-packagr writes ESM declaration files with relative imports that have no file extension.',
  '@sentry/astro node16-cjs InternalResolutionError':
    'The package has "type": "module", so its declaration files are ESM, and their relative imports have no file extension.',
  '@sentry/astro node16-esm InternalResolutionError':
    'The package has "type": "module", so its declaration files are ESM, and their relative imports have no file extension.',
  '@sentry/deno node16-esm InternalResolutionError':
    'The declaration files are in the ESM build folder, and their relative imports have no file extension.',
  '@sentry/ember node16-cjs UnexpectedModuleSyntax':
    'dist/index.js has ESM syntax in a package without "type": "module". Only the Ember build loads it.',
  '@sentry/ember node16-esm UnexpectedModuleSyntax':
    'dist/index.js has ESM syntax in a package without "type": "module". Only the Ember build loads it.',
  '@sentry/nextjs node16-esm NamedExports':
    "Node's `import` loads the CJS build (`node` condition), and Node does not detect some of its named exports, for example `logger`.",
  '@sentry/nuxt/module/plugins node16-esm UnexpectedModuleSyntax':
    'The plugin files have ESM syntax in a package without "type": "module". Only the Nuxt build loads them.',
  '@sentry/remix node16-esm NamedExports':
    "Node's `import` loads the CJS build (`node` condition), and Node does not detect some of its named exports, for example `growthbookIntegration`.",
};

const unexpected = new Map();
const found = new Set();

for (const name of getPackageNames()) {
  const entries = getTypedEntries(name);
  const typedSubpaths = new Set(entries.map(entry => entry.subpath));
  const esmOnlySubpaths = new Set(
    entries.filter(entry => entry.formats.nodeRequire !== 'cjs').map(entry => entry.subpath),
  );
  const { exports, version } = getPackageJson(name);

  const analysis = await checkPackage(new Package(readPackageFiles(name), name, version), {
    // Entries without types are JS-only (hooks, loaders, injected files).
    excludeEntrypoints: Object.keys(exports).filter(subpath => !typedSubpaths.has(subpath)),
  });

  if (!analysis.types) {
    unexpected.set(name, 'The package has no types.');
    continue;
  }

  for (const problem of analysis.problems) {
    for (const subpath of Object.keys(analysis.entrypoints)) {
      for (const resolutionKind of RESOLUTION_KINDS) {
        if (!problemAffectsEntrypointResolution(problem, subpath, resolutionKind, analysis)) {
          continue;
        }
        if (resolutionKind === 'node16-cjs' && esmOnlySubpaths.has(subpath) && ESM_ONLY_PROBLEMS.has(problem.kind)) {
          continue;
        }

        const key = `${name}${subpath === '.' ? '' : subpath.slice(1)} ${resolutionKind} ${problem.kind}`;
        found.add(key);
        if (!KNOWN_PROBLEMS[key] && !unexpected.has(key)) {
          unexpected.set(key, JSON.stringify(problem));
        }
      }
    }
  }
}

const fixed = Object.keys(KNOWN_PROBLEMS).filter(key => !found.has(key));

if (unexpected.size) {
  console.error(`attw found ${unexpected.size} new problems:\n`);
  for (const [key, details] of unexpected) {
    console.error(`${key}\n  ${details}`);
  }
  console.error('\nSee https://github.com/arethetypeswrong/arethetypeswrong.github.io/tree/main/docs/problems\n');
}
if (fixed.length) {
  console.error(
    `attw does not report these known problems any more, remove them from KNOWN_PROBLEMS:\n${fixed.join('\n')}`,
  );
}
if (unexpected.size || fixed.length) {
  process.exit(1);
}

console.log(`attw: ${getPackageNames().length} packages, no new problems.`);

/** Reads the files of an installed package in the format of `Package` (paths start with `/node_modules/<name>/`). */
function readPackageFiles(name) {
  const packageDir = getPackageDir(name);
  const files = {};
  const walk = dir => {
    for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
      const filePath = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        if (dirent.name !== 'node_modules') {
          walk(filePath);
        }
      } else {
        const relativePath = path.relative(packageDir, filePath).split(path.sep).join('/');
        files[`/node_modules/${name}/${relativePath}`] = new Uint8Array(fs.readFileSync(filePath));
      }
    }
  };
  walk(packageDir);
  return files;
}
