/* eslint-disable no-console */
import { spawn } from 'child_process';
import * as dotenv from 'dotenv';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { sync as globSync } from 'glob';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { copyToTemp } from './lib/copyToTemp';
import { registrySetup } from './registrySetup';

interface SentryTestVariant {
  'build-command': string;
  'assert-command'?: string;
  label?: string;
}

interface PackageJson {
  sentryTest?: {
    variants?: SentryTestVariant[];
    optionalVariants?: SentryTestVariant[];
  };
}

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

function findMatchingVariant(variants: SentryTestVariant[], variantLabel: string): SentryTestVariant | undefined {
  const variantLabelLower = variantLabel.toLowerCase();

  return variants.find(variant => variant.label?.toLowerCase().includes(variantLabelLower));
}

async function getVariantBuildCommand(
  packageJsonPath: string,
  variantLabel: string,
  testAppPath: string,
): Promise<{ buildCommand: string; assertCommand: string; testLabel: string; matchedVariantLabel?: string }> {
  try {
    const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
    const packageJson: PackageJson = JSON.parse(packageJsonContent);

    const allVariants = [
      ...(packageJson.sentryTest?.variants || []),
      ...(packageJson.sentryTest?.optionalVariants || []),
    ];

    const matchingVariant = findMatchingVariant(allVariants, variantLabel);

    if (matchingVariant) {
      return {
        buildCommand: matchingVariant['build-command'] || 'pnpm test:build',
        assertCommand: matchingVariant['assert-command'] || 'pnpm test:assert',
        testLabel: matchingVariant.label || testAppPath,
        matchedVariantLabel: matchingVariant.label,
      };
    }

    console.log(`No matching variant found for "${variantLabel}" in ${testAppPath}, using default build`);
  } catch {
    console.log(`Could not read variants from package.json for ${testAppPath}, using default build`);
  }

  return {
    buildCommand: 'pnpm test:build',
    assertCommand: 'pnpm test:assert',
    testLabel: testAppPath,
  };
}

async function run(): Promise<void> {
  // Load environment variables from .env file locally
  dotenv.config();

  // Allow to run a single app only via `yarn test:run <app-name>`
  const appName = process.argv[2] || '';
  // Forward any additional flags to the test command
  const allTestFlags = process.argv.slice(3);

  // Check for --variant flag
  let variantLabel: string | undefined;
  let skipNextFlag = false;

  const testFlags = allTestFlags.filter((flag, index) => {
    // Skip this flag if it was marked to skip (variant value after --variant)
    if (skipNextFlag) {
      skipNextFlag = false;
      return false;
    }

    // Handle --variant=<value> format
    if (flag.startsWith('--variant=')) {
      const value = flag.slice('--variant='.length);
      const trimmedValue = value?.trim();
      if (trimmedValue) {
        variantLabel = trimmedValue;
      } else {
        console.warn('Warning: --variant= specified but no value provided. Ignoring variant flag.');
      }
      return false; // Remove this flag from testFlags
    }

    // Handle --variant <value> format
    if (flag === '--variant') {
      if (index + 1 < allTestFlags.length) {
        const value = allTestFlags[index + 1];
        const trimmedValue = value?.trim();
        if (trimmedValue) {
          variantLabel = trimmedValue;
          skipNextFlag = true; // Mark next flag to be skipped
        } else {
          console.warn('Warning: --variant specified but no value provided. Ignoring variant flag.');
        }
      } else {
        console.warn('Warning: --variant specified but no value provided. Ignoring variant flag.');
      }
      return false;
    }

    return true;
  });

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
      // Resolve variant if needed
      const { buildCommand, assertCommand, testLabel, matchedVariantLabel } = variantLabel
        ? await getVariantBuildCommand(join(tmpDirPath, 'package.json'), variantLabel, testAppPath)
        : {
            buildCommand: 'pnpm test:build',
            assertCommand: 'pnpm test:assert',
            testLabel: testAppPath,
          };

      // Print which variant we're using if found
      if (matchedVariantLabel) {
        console.log(`\n\nUsing variant: "${matchedVariantLabel}"\n\n`);
      }

      console.log(`Building ${testLabel} in ${tmpDirPath}...`);
      await asyncExec(`volta run ${buildCommand}`, { env, cwd });

      console.log(`Testing ${testLabel}...`);
      // Pass command as a string to support shell features (env vars, operators like &&)
      // This matches how buildCommand is handled for consistency
      // Properly quote test flags to preserve spaces and special characters
      const quotedTestFlags = testFlags.map(flag => {
        // If flag contains spaces or special shell characters, quote it
        if (
          flag.includes(' ') ||
          flag.includes('"') ||
          flag.includes("'") ||
          flag.includes('$') ||
          flag.includes('`')
        ) {
          // Escape single quotes and wrap in single quotes (safest for shell)
          return `'${flag.replace(/'/g, "'\\''")}'`;
        }
        return flag;
      });
      const testCommand = `volta run ${assertCommand}${quotedTestFlags.length > 0 ? ` ${quotedTestFlags.join(' ')}` : ''}`;
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
