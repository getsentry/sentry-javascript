/* eslint-disable no-console */

import { addPnpmOverrides } from './lib/pnpmOverrides';
import * as path from 'path';

async function run(): Promise<void> {
  const tmpDirPath = process.argv[2];
  const packedDirPath = process.argv[3];

  if (!tmpDirPath || !packedDirPath) {
    throw new Error('Tmp dir path and packed dir path are required');
  }

  await addPnpmOverrides(path.resolve(tmpDirPath), path.resolve(packedDirPath));
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
