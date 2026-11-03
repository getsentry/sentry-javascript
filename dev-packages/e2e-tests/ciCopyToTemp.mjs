// @ts-check
/* eslint-disable no-console */

import { copyToTemp } from './lib/copyToTemp.mjs';
import { applyRuntimeFiles } from './lib/runtimeFiles.mjs';

const originalPath = process.argv[2];
const tmpDirPath = process.argv[3];

if (!originalPath || !tmpDirPath) {
  throw new Error('Original path and tmp dir path are required');
}

console.log(`Copying ${originalPath} to ${tmpDirPath}...`);

await copyToTemp(originalPath, tmpDirPath);

if (process.env.RUNTIME) {
  applyRuntimeFiles(tmpDirPath, process.env.RUNTIME);
}
