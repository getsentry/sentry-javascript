// Fails if any built file (default: everything in `build/`) uses syntax newer than the given ES version.
// Globs starting with `!` exclude files from the other globs.
/* eslint-disable no-console */
import { globSync, readFileSync } from 'node:fs';
import { parse } from 'acorn';

const [target, ...args] = process.argv.slice(2);
const ecmaVersion = Number(target?.replace(/^es/, ''));
const excludes = ['**/node_modules/**', ...args.filter(arg => arg.startsWith('!')).map(arg => arg.slice(1))];
const includes = args.filter(arg => !arg.startsWith('!'));
const patterns = includes.length ? includes : ['build/**/*.{js,mjs,cjs}'];

if (!ecmaVersion) {
  console.error('Usage: node es-check.mjs <es20XX> [glob...]');
  process.exit(1);
}

let fileCount = 0;
let failed = false;

for (const pattern of patterns) {
  const files = globSync(pattern, { exclude: excludes });

  if (!files.length) {
    console.error(`es-check: no files match ${pattern}`);
    failed = true;
  }

  for (const file of files) {
    fileCount++;
    try {
      // Module grammar is stricter than script grammar and also accepts CJS and IIFE output, so
      // one mode covers every file. Hashbangs are allowed for CLI entry points.
      parse(readFileSync(file, 'utf8'), { ecmaVersion, sourceType: 'module', allowHashBang: true });
    } catch (error) {
      console.error(`es-check: ${file} is not valid ${target}: ${error.message}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log(`es-check: ${fileCount} files are valid ${target}`);
