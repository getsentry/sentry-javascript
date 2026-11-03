// @ts-check
import * as path from 'node:path';
import { addPnpmOverrides } from './lib/pnpmOverrides.mjs';

const tmpDirPath = process.argv[2];
const packedDirPath = process.argv[3];

if (!tmpDirPath || !packedDirPath) {
  throw new Error('Tmp dir path and packed dir path are required');
}

await addPnpmOverrides(path.resolve(tmpDirPath), path.resolve(packedDirPath));
