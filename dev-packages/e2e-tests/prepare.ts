/* eslint-disable no-console */
import * as dotenv from 'dotenv';
import { syncPackedTarballSymlinks } from './lib/syncPackedTarballSymlinks';

async function run(): Promise<void> {
  // Load environment variables from .env file locally
  dotenv.config();

  syncPackedTarballSymlinks();
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
