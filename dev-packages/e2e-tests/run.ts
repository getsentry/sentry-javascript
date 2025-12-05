/* eslint-disable no-console */
import { spawn } from 'child_process';
import * as dotenv from 'dotenv';
import { mkdtemp, rm } from 'fs/promises';
import { sync as globSync } from 'glob';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { copyToTemp } from './lib/copyToTemp';
import { registrySetup } from './registrySetup';

const DEFAULT_DSN = 'https://username@domain/123';
const DEFAULT_SENTRY_ORG_SLUG = 'sentry-javascript-sdks';
const DEFAULT_SENTRY_PROJECT = 'sentry-javascript-e2e-tests';

function asyncExec(
  command: string | string[],
  options: { env: Record<string, string | undefined>; cwd: string },
): Promise<void> {
  return new Promise((resolve, reject) => {
    // If command is an array, use spawn with separate command and args (safer)
    // If command is a string, maintain backward compatibility with shell: true
    let process: ReturnType<typeof spawn>;
    if (typeof command === 'string') {
      process = spawn(command, { ...options, shell: true });
    } else {
      if (command.length === 0) {
        return reject(new Error('Command array cannot be empty'));
      }
      const cmd = command[0];
      if (!cmd) {
        return reject(new Error('Command array cannot be empty'));
      }
      process = spawn(cmd, command.slice(1), { ...options, shell: false });
    }

    if (process.stdout) {
      process.stdout.on('data', data => {
        console.log(`${data}`);
      });
    }

    if (process.stderr) {
      process.stderr.on('data', data => {
        console.error(`${data}`);
      });
    }

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
  const appName = process.argv[2] || '';
  // Forward any additional flags to the test command
  const testFlags = process.argv.slice(3);

  const dsn = process.env.E2E_TEST_DSN || DEFAULT_DSN;

  const envVarsToInject = {
    E2E_TEST_DSN: dsn,
    NEXT_PUBLIC_E2E_TEST_DSN: dsn,
    PUBLIC_E2E_TEST_DSN: dsn,
    REACT_APP_E2E_TEST_DSN: dsn,
    E2E_TEST_SENTRY_ORG_SLUG: process.env.E2E_TEST_SENTRY_ORG_SLUG || DEFAULT_SENTRY_ORG_SLUG,
    E2E_TEST_SENTRY_PROJECT: process.env.E2E_TEST_SENTRY_PROJECT || DEFAULT_SENTRY_PROJECT,
    // Pass workspace root so tests copied to temp dirs can find local packages
    SENTRY_E2E_WORKSPACE_ROOT: resolve(__dirname, '../..'),
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
    await asyncExec('pnpm cache delete "@sentry/*"', { env, cwd: __dirname });

    const testAppPaths = appName ? [appName.trim()] : globSync('*', { cwd: `${__dirname}/test-applications/` });

    console.log(`Runnings tests for: ${testAppPaths.join(', ')}`);
    console.log('');

    for (const testAppPath of testAppPaths) {
      const originalPath = resolve('test-applications', testAppPath);
      const tmpDirPath = await mkdtemp(join(tmpdir(), `sentry-e2e-tests-${appName}-`));

      await copyToTemp(originalPath, tmpDirPath);
      const cwd = tmpDirPath;

      console.log(`Building ${testAppPath} in ${tmpDirPath}...`);
      await asyncExec('volta run pnpm test:build', { env, cwd });

      console.log(`Testing ${testAppPath}...`);
      // Pass command and arguments as an array to prevent command injection
      const testCommand = ['volta', 'run', 'pnpm', 'test:assert', ...testFlags];
      await asyncExec(testCommand, { env, cwd });

      // clean up (although this is tmp, still nice to do)
      await rm(tmpDirPath, { recursive: true });
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
