/* eslint-disable no-console */
import * as dotenv from 'dotenv';
import { registrySetup } from './registrySetup';

async function run(): Promise<void> {
  // Load environment variables from .env file locally
  dotenv.config();

  try {
    registrySetup();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
