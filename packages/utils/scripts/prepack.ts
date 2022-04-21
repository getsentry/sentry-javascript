/* eslint-disable no-console */

// DO NOT RUN this script yourself!
// This is invoked from the main `prepack.ts` script in `sentry-javascript/scripts/prepack.ts`.

import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as path from 'path';

export function prepack(buildDir: string): boolean {
  // copy package-specific assets to build dir
  const assetPath = path.resolve('jsPolyfills');
  const destinationPath = path.resolve(buildDir, 'jsPolyfills');
  try {
    if (!fs.existsSync(assetPath)) {
      console.error(
        "\nERROR: Missing 'packages/utils/jsPolyfills' directory. Please run `yarn build` in the `utils` package before running this script again.",
      );
      return false;
    }
    console.log(`Copying jsPolyfills to ${path.relative('../..', destinationPath)}.`);
    fse.copySync(assetPath, destinationPath);
  } catch (error) {
    console.error(`\nERROR: Error while copying jsPolyfills to ${path.relative('../..', destinationPath)}:\n${error}`);
    return false;
  }
  return true;
}
