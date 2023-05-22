/* eslint-disable no-console */
import * as childProcess from 'child_process';

import { TEST_REGISTRY_CONTAINER_NAME } from './lib/constants';

export default function testTeardown(): void {
  console.log('Stopping test registry...');
  // Stop test registry container (Verdaccio) if it was already running
  childProcess.spawnSync('docker', ['stop', TEST_REGISTRY_CONTAINER_NAME], { stdio: 'ignore' });
}
