/* eslint-disable no-console */
import { spawn } from 'child_process';
import { resolve } from 'path';
import * as dotenv from 'dotenv';
import { sync as globSync } from 'glob';

import { registrySetup } from './registrySetup';

const DEFAULT_DSN = 'https://username@domain/123';
const DEFAULT_SENTRY_ORG_SLUG = 'sentry-javascript-sdks';
const DEFAULT_SENTRY_PROJECT = 'sentry-javascript-e2e-tests';

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

  const dsn = process.env.E2E_TEST_DSN || DEFAULT_DSN;

  const envVarsToInject = {
    E2E_TEST_DSN: dsn,
    NEXT_PUBLIC_E2E_TEST_DSN: dsn,
    PUBLIC_E2E_TEST_DSN: dsn,
    REACT_APP_E2E_TEST_DSN: dsn,
    E2E_TEST_SENTRY_ORG_SLUG: process.env.E2E_TEST_SENTRY_ORG_SLUG || DEFAULT_SENTRY_ORG_SLUG,
    E2E_TEST_SENTRY_PROJECT: process.env.E2E_TEST_SENTRY_PROJECT || DEFAULT_SENTRY_PROJECT,
  };

  const env = {
    ...process.env,
    ...envVarsToInject,
  };

  try {
    console.log('Cleaning test-applications...');
    console.log('');

    if (!process.env.SKIP_REGISTRY) {
      registrySetup();
    }

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
