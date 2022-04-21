/* eslint-disable no-console */

// DO NOT RUN this script yourself!
// This is invoked from the main `prepack.ts` script in `sentry-javascript/scripts/prepack.ts`.

import * as fs from 'fs';
import * as path from 'path';
import * as rimraf from 'rimraf';

const existingPolyfillDir = path.resolve(process.cwd(), 'jsPolyfills');
const PACKAGE_ASSETS = fs.readdirSync(existingPolyfillDir).filter(filename => filename !== 'README.md');

export function prepack(buildDir: string): boolean {
  const newPolyfillDir = path.resolve(process.cwd(), buildDir, 'jsPolyfills');
  rimraf.sync(newPolyfillDir);
  fs.mkdirSync(newPolyfillDir);

  // copy package-specific assets to build dir
  return PACKAGE_ASSETS.every(asset => {
    const assetPath = path.resolve(existingPolyfillDir, asset);
    const destinationPath = path.resolve(newPolyfillDir, asset);
    console.log(`Copying ${asset} to ${path.relative('../..', destinationPath)}.`);
    try {
      fs.copyFileSync(assetPath, destinationPath);
    } catch (error) {
      console.error(`Error while copying ${asset} to ${newPolyfillDir}: ${error}`);
      return false;
    }
    return true;
  });
}
