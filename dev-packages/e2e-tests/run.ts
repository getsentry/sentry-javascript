/* eslint-disable max-lines */
/* eslint-disable no-console */
import { spawn } from 'child_process';
import { resolve } from 'path';
import * as dotenv from 'dotenv';
import { sync as globSync } from 'glob';

import { validate } from './lib/validate';
import { registrySetup } from './registrySetup';

function asyncExec(command: string, options: { env: Record<string, string | undefined>; cwd: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, { ...options, shell: true });

    process.stdout.on('data', data => {
      console.log(`${data}`);
    });

    process.stderr.on('data', data => {
      console.error(`${data}`);
    });

    process.on('error', error => {
      reject(error);
    });

    process.on('close', code => {
      if (code !== 0) {
        return reject();
      }
      resolve();
    });
  });
}

async function run(): Promise<void> {
  // Load environment variables from .env file locally
  dotenv.config();

  // Allow to run a single app only via `yarn test:run <app-name>`
  const appName = process.argv[2];

  if (!validate()) {
    process.exit(1);
  }

  const envVarsToInject = {
    NEXT_PUBLIC_E2E_TEST_DSN: process.env.E2E_TEST_DSN,
    PUBLIC_E2E_TEST_DSN: process.env.E2E_TEST_DSN,
    REACT_APP_E2E_TEST_DSN: process.env.E2E_TEST_DSN,
  };

  const env = { ...process.env, ...envVarsToInject };

  try {
    console.log('Cleaning test-applications...');
    console.log('');

    registrySetup();

    await asyncExec('pnpm clean:test-applications', { env, cwd: __dirname });

    const testAppPaths = appName ? [appName.trim()] : globSync('*', { cwd: `${__dirname}/test-applications/` });

    console.log(`Runnings tests for: ${testAppPaths.join(', ')}`);
    console.log('');

    for (const testAppPath of testAppPaths) {
      const cwd = resolve('test-applications', testAppPath);

      console.log(`Building ${testAppPath}...`);
      await asyncExec('pnpm test:build', { env, cwd });

      console.log(`Testing ${testAppPath}...`);
      await asyncExec('pnpm test:assert', { env, cwd });
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
