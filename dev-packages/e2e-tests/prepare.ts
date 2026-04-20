/* eslint-disable no-console */
import * as dotenv from 'dotenv';
import { registrySetup } from './registrySetup';

async function run(): Promise<void> {
  // Load environment variables from .env file locally
  dotenv.config();

  await registrySetup({ daemonize: true });
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
