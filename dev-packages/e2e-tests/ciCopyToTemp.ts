/* eslint-disable no-console */

import { copyToTemp } from './lib/copyToTemp';
import { applyRuntimeFiles, getRuntimeFromLabel } from './lib/runtimeFiles';

async function run(): Promise<void> {
  const originalPath = process.argv[2];
  const tmpDirPath = process.argv[3];
  const variantLabel = process.argv[4];

  if (!originalPath || !tmpDirPath) {
    throw new Error('Original path and tmp dir path are required');
  }

  console.log(`Copying ${originalPath} to ${tmpDirPath}...`);

  await copyToTemp(originalPath, tmpDirPath);

  const runtime = getRuntimeFromLabel(variantLabel);
  if (runtime) {
    applyRuntimeFiles(tmpDirPath, runtime);
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
