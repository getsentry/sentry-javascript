/* eslint-disable max-lines */
/* eslint-disable no-console */
import * as dotenv from 'dotenv';
import * as glob from 'glob';

import { runAllTestApps } from './lib/runAllTestApps';
import { validate } from './lib/validate';
import { registrySetup } from './registrySetup';

async function run(): Promise<void> {
  // Load environment variables from .env file locally
  dotenv.config();

  if (!validate()) {
    process.exit(1);
  }

  const envVarsToInject = {
    REACT_APP_E2E_TEST_DSN: process.env.E2E_TEST_DSN,
    NEXT_PUBLIC_E2E_TEST_DSN: process.env.E2E_TEST_DSN,
    PUBLIC_E2E_TEST_DSN: process.env.E2E_TEST_DSN,
    BASE_PORT: '27496', // just some random port
  };

  try {
    registrySetup();

    const recipePaths = glob.sync(`${__dirname}/test-applications/*/test-recipe.json`, { absolute: true });

    await runAllTestApps(recipePaths, envVarsToInject);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

void run();
