/* eslint-disable no-console */

import { copyToTemp } from './lib/copyToTemp';

async function run(): Promise<void> {
  const originalPath = process.argv[2];
  const tmpDirPath = process.argv[3];

  if (!originalPath || !tmpDirPath) {
    throw new Error('Original path and tmp dir path are required');
  }

  console.log(`Copying ${originalPath} to ${tmpDirPath}...`);

  await copyToTemp(originalPath, tmpDirPath);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
