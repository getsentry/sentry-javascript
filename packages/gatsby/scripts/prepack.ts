/* eslint-disable no-console */

// DO NOT RUN this script yourself!
// This is invoked from the main `prepack.ts` script in `sentry-javascript/scripts/prepack.ts`.

import * as fs from 'fs';
import * as path from 'path';

const PACKAGE_ASSETS = ['gatsby-browser.js', 'gatsby-node.js'];

export function prepack(buildDir: string): void {
  // copy package-specific assets to build dir
  PACKAGE_ASSETS.forEach(asset => {
    const assetPath = path.resolve(asset);
    try {
      if (!fs.existsSync(assetPath)) {
        console.error(`Asset ${asset} does not exist.`);
        process.exit(1);
      }
      fs.copyFileSync(assetPath, path.resolve(buildDir, asset));
    } catch (error) {
      console.error(`Error while copying ${asset} to ${buildDir}`);
      process.exit(1);
    }
  });
}
