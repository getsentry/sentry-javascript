/* eslint-disable no-console */

import * as fs from 'fs';
import * as path from 'path';

const PACKAGE_ASSETS = [
  'scripts/sentry-upload-sourcemaps.js',
  'scripts/createRelease.js',
  'scripts/deleteSourcemaps.js',
  'scripts/injectDebugId.js',
];

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
      const scriptsDir = path.resolve(buildDir, 'scripts');
      if (!fs.existsSync(scriptsDir)) {
        console.log('Creating missing directory', scriptsDir);
        fs.mkdirSync(scriptsDir);
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
