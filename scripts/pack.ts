/* eslint-disable no-console */

/*
  This script packs the build folder into a tarball.
*/

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { postpack } from './postpack';
import { prepack } from './prepack';

const NPM_BUILD_DIR = 'build/npm';
const BUILD_DIR = 'build';

const packageWithBundles = process.argv.includes('--bundles');
const buildDir = packageWithBundles ? NPM_BUILD_DIR : BUILD_DIR;

async function pack(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkgJson = require(path.resolve('package.json')) as Record<string, string>;

  // check if build dir exists
  if (!fs.existsSync(path.resolve(buildDir))) {
    console.error(`\nERROR: Directory '${buildDir}' does not exist in ${pkgJson.name}.`);
    console.error("This script should only be executed after you've run `yarn build`.");
    process.exit(1);
  }

  await prepack(buildDir);

  execSync(`npm pack ./${buildDir}`, { stdio: 'inherit', cwd: process.cwd() });

  await postpack(buildDir);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
void pack();
