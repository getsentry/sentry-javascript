/* eslint-disable no-console */
import * as dotenv from 'dotenv';
import { registryRelease, registrySetup } from './registrySetup';

async function run(): Promise<void> {
  // Load environment variables from .env file locally
  dotenv.config();

  await registrySetup();
  // Leave Verdaccio running for later CI steps (e.g. pnpm install); this process may exit.
  registryRelease();
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
