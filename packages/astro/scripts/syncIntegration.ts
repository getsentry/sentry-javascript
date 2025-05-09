/* eslint-disable no-console */

import * as fse from 'fs-extra';
import * as path from 'path';

const buildDir = path.resolve('build');
const srcIntegrationDir = path.resolve(path.join('src', 'integration'));
const destIntegrationDir = path.resolve(path.join(buildDir, 'integration'));

try {
  fse.copySync(srcIntegrationDir, destIntegrationDir, {
    filter: (src, _) => {
      return !src.endsWith('.md');
    },
  });
  console.log('\nCopied Astro integration to ./build/integration\n');
} catch (e) {
  console.error('\nError while copying integration to build dir:');
  console.error(e);
}
