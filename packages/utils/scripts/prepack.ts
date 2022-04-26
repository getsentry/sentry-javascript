/* eslint-disable no-console */

// DO NOT RUN this script yourself!
// This is invoked from the main `prepack.ts` script in `sentry-javascript/scripts/prepack.ts`.

import * as fs from 'fs';
import * as path from 'path';
import { CopyErrorInfo, CopyOperation, default as copy } from 'recursive-copy';
import * as rimraf from 'rimraf';

export async function prepack(buildDir: string): Promise<boolean> {
  const existingPolyfillDir = path.resolve(process.cwd(), 'jsPolyfills');
  if (!fs.existsSync(existingPolyfillDir)) {
    console.error(
      'Missing `packages/utils/jsPolyfills` directory. Please run `yarn build` in the `utils` package before running this script again.',
    );
  }

  const newPolyfillDir = path.resolve(process.cwd(), buildDir, 'jsPolyfills');
  rimraf.sync(newPolyfillDir);
  fs.mkdirSync(newPolyfillDir);

  const copyOperation = copy(existingPolyfillDir, newPolyfillDir, {
    filter: filename => !filename.endsWith('README.md'),
    overwrite: true,
  });
  void copyOperation.on(copy.events.COPY_FILE_START, function (copyInfo: CopyOperation) {
    console.info(
      `Copying ${path.relative(process.cwd(), copyInfo.src)} to ${path.relative(process.cwd(), copyInfo.dest)}`,
    );
  });
  void copyOperation.on(copy.events.ERROR, function (error: Error, copyErrorInfo: CopyErrorInfo) {
    console.error(
      `Error while copying ${path.relative(process.cwd(), copyErrorInfo.src)} to ${path.relative(
        process.cwd(),
        copyErrorInfo.dest,
      )}: ${error}`,
    );
  });

  try {
    await copyOperation;
  } catch (error) {
    console.error(`Copy failed: ${error}`);
    return false;
  }
  return true;

  // copy package-specific assets to build dir
  // return PACKAGE_ASSETS.every(asset => {
  //   const assetPath = path.resolve(existingPolyfillDir, asset);
  //   const destinationPath = path.resolve(newPolyfillDir, asset);
  //   console.log(`Copying ${asset} to ${path.relative('../..', destinationPath)}.`);
  //   try {
  //     fs.copyFileSync(assetPath, destinationPath);
  //   } catch (error) {
  //     console.error(`Error while copying ${asset} to ${newPolyfillDir}: ${error}`);
  //     return false;
  //   }
  //   return true;
  // });
}
