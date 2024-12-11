/* eslint-disable no-console */
/**
 * If `yarn build:types:watch` is run without types files previously having been created, the build will get stuck in an
 * errored state. This happens because lerna runs all of the packages' `yarn build:types:watch` statements in parallel,
 * and so packages like `@sentry/browser` will at first be missing types they import from packages like `@sentry/core`
 * and `@sentry/core`, causing errors to be thrown. Normally this is fine, because as the dependencies' types get
 * built, file changes will be detected and the dependent packages' types will try again to build themselves. There
 * might be several rounds of this, but in theory, eventually all packages should end up with an error-free build. For
 * whatever reason, though, at a certain point the process hangs, either because changes stop being detected or because
 * recompiles stop being triggered by detected changes.
 *
 * Either way, the process gets stuck. The solution is to run a sequential build first, because as long as there are
 * existing files the first time the watch command runs, no subsequent changes ever cause a hang, no matter how many
 * rounds of recompilation are needed. (It's not entirely clear why this is the case.) We only want to take the time to
 * do that if we have to, though, so we first check all of the relevant packages to see if there are pre-existing types
 * files.
 */

import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const packages = fs.readdirSync(path.join(__dirname, '../packages'));

for (const pkg of packages) {
  const packagePath = path.join(__dirname, '../packages', pkg);

  if (!fs.lstatSync(packagePath).isDirectory() || !fs.readdirSync(packagePath).includes('package.json')) {
    continue;
  }

  const packageJSON = JSON.parse(fs.readFileSync(path.resolve(packagePath, 'package.json'), 'utf-8')) as {
    scripts: Record<string, string>;
  };

  if ('build:types' in packageJSON.scripts && !fs.existsSync(path.resolve(packagePath, 'build/types'))) {
    console.warn(
      `\nWarning: Found no pre-existing types in package \`${pkg}\`. Performing a sequential types build before starting the watch process.\n`,
    );
    childProcess.execSync('yarn build:types', { stdio: 'inherit' });
    break;
  }
}

console.log('\nStarting `yarn build:types:watch`.\n');
childProcess.execSync('yarn lerna run --parallel build:types:watch', { stdio: 'inherit' });
