/* eslint-disable no-console */

// DO NOT RUN this script yourself!
// This is invoked from the main `prepack.ts` script in `sentry-javascript/scripts/prepack.ts`.

import * as fs from 'fs';
import * as path from 'path';

const PACKAGE_ASSETS = ['gatsby-browser.js', 'gatsby-node.js'];

export function prepack(buildDir: string): boolean {
  // copy package-specific assets to build dir
  return PACKAGE_ASSETS.every(asset => {
    const assetPath = path.resolve(asset);
    try {
      if (!fs.existsSync(assetPath)) {
        console.error(`Asset ${asset} does not exist.`);
        return false;
      }
      fs.copyFileSync(assetPath, path.resolve(buildDir, asset));
    } catch (error) {
      console.error(`Error while copying ${asset} to ${buildDir}`);
      return false;
    }
    return true;
  });
}
