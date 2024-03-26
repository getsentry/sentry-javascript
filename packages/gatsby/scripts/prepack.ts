/* eslint-disable no-console */

// DO NOT RUN this script yourself!
// This is invoked from the main `prepack.ts` script in `sentry-javascript/scripts/prepack.ts`.

import * as fs from 'fs';
import * as path from 'path';

const PACKAGE_ASSETS = ['gatsby-node.js', 'gatsby-node.d.ts'];

export function prepack(buildDir: string): boolean {
  // copy package-specific assets to build dir
  return PACKAGE_ASSETS.every(asset => {
    const assetPath = path.resolve(asset);
    const destinationPath = path.resolve(buildDir, asset);
    try {
      if (!fs.existsSync(assetPath)) {
        console.error(`\nERROR: Asset '${asset}' does not exist.`);
        return false;
      }
      console.log(`Copying ${path.basename(asset)} to ${path.relative('../..', destinationPath)}.`);
      fs.copyFileSync(assetPath, destinationPath);
    } catch (error) {
      console.error(
        `\nERROR: Error while copying ${path.basename(asset)} to ${path.relative('../..', destinationPath)}:\n`,
        error,
      );
      return false;
    }
    return true;
  });
}
