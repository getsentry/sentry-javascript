// @ts-check
/* eslint-disable no-console */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyToTemp } from './lib/copyToTemp.mjs';
import { addPnpmOverrides } from './lib/pnpmOverrides.mjs';
import { applyRuntimeFiles } from './lib/runtimeFiles.mjs';
import { syncPackedTarballSymlinks } from './lib/syncPackedTarballSymlinks.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * `runtime` is the runtime of the variant (`bun`, `deno` or `cloudflare`). It sets `RUNTIME` and selects the
 * runtime-specific files.
 * @typedef {{ 'build-command': string; 'assert-command'?: string; label?: string; skip?: boolean; runtime?: string }} SentryTestVariant
 */

/** @typedef {{ sentryTest?: { baseVariant?: SentryTestVariant; variants?: SentryTestVariant[]; optionalVariants?: SentryTestVariant[]; canaryVariants?: SentryTestVariant[] } }} PackageJson */

const DEFAULT_DSN = 'https://username@domain/123';
const DEFAULT_SENTRY_ORG_SLUG = 'sentry-javascript-sdks';
const DEFAULT_SENTRY_PROJECT = 'sentry-javascript-e2e-tests';

/**
 * @param {string | string[]} command
 * @param {{ env: Record<string, string | undefined>; cwd: string }} options
 * @returns {Promise<void>}
 */
function asyncExec(command, options) {
  return new Promise((resolve, reject) => {
    // If command is an array, use spawn with separate command and args (safer)
    // If command is a string, maintain backward compatibility with shell: true
    /** @type {ReturnType<typeof spawn>} */
    let process;
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

/**
 * @param {SentryTestVariant[]} variants
 * @param {string} variantLabel
 * @returns {SentryTestVariant | undefined}
 */
function findMatchingVariant(variants, variantLabel) {
  const variantLabelLower = variantLabel.toLowerCase();

  return variants.find(variant => variant.label?.toLowerCase().includes(variantLabelLower));
}

/**
 * @param {string} packageJsonPath
 * @param {string} variantLabel
 * @param {string} testAppPath
 * @returns {Promise<{ buildCommand: string; assertCommand: string; testLabel: string; matchedVariantLabel?: string; skip?: boolean; runtime?: string }>}
 */
async function getVariantBuildCommand(packageJsonPath, variantLabel, testAppPath) {
  try {
    const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
    /** @type {PackageJson} */
    const packageJson = JSON.parse(packageJsonContent);

    const allVariants = [
      ...(packageJson.sentryTest?.baseVariant ? [packageJson.sentryTest.baseVariant] : []),
      ...(packageJson.sentryTest?.variants || []),
      ...(packageJson.sentryTest?.optionalVariants || []),
      ...(packageJson.sentryTest?.canaryVariants || []),
    ];

    const matchingVariant = findMatchingVariant(allVariants, variantLabel);

    if (matchingVariant) {
      return {
        buildCommand: matchingVariant['build-command'] || 'pnpm test:build',
        assertCommand: matchingVariant['assert-command'] || 'pnpm test:assert',
        testLabel: matchingVariant.label || testAppPath,
        matchedVariantLabel: matchingVariant.label,
        skip: matchingVariant.skip,
        runtime: matchingVariant.runtime,
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

async function run() {
  // Load environment variables from .env file locally
  const envFile = join(__dirname, '.env');
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }

  // Allow to run a single app only via `pnpm run test:run <app-name>`
  const appName = process.argv[2] || '';
  // Forward any additional flags to the test command
  const allTestFlags = process.argv.slice(3);

  // Check for --variant flag
  /** @type {string | undefined} */
  let variantLabel;
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

  const env = { ...process.env, ...envVarsToInject };

  console.log('Syncing packed tarball symlinks...');
  console.log('');

  syncPackedTarballSymlinks();

  console.log('Cleaning test-applications...');
  console.log('');

  await asyncExec('pnpm run clean:test-applications', { env, cwd: __dirname });
  await asyncExec('pnpm cache delete "@sentry/*"', { env, cwd: __dirname });

  const testAppPaths = appName
    ? [appName.trim()]
    : readdirSync(join(__dirname, 'test-applications'), { withFileTypes: true })
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
        .map(entry => entry.name);

  console.log(`Runnings tests for: ${testAppPaths.join(', ')}`);
  console.log('');

  const packedDirPath = resolve(__dirname, 'packed');

  for (const testAppPath of testAppPaths) {
    const originalPath = resolve('test-applications', testAppPath);
    const tmpDirPath = await mkdtemp(join(tmpdir(), `sentry-e2e-tests-${appName}-`));

    await copyToTemp(originalPath, tmpDirPath);
    await addPnpmOverrides(tmpDirPath, packedDirPath);

    // The Sentry CLI keeps its config and a SQLite cache in `~/.sentry`, so without this every
    // build reads and writes the machine's global CLI state. That leaks a developer's real auth
    // config into the run, and any state the natively installed CLI leaves behind - notably a
    // `cli.db` it has switched to WAL journal mode, which the CLI's wasm SQLite build cannot open
    // at all - breaks the build with `unable to open database file`. Give each app its own.
    const sentryConfigDir = join(tmpDirPath, '.tmp_sentry_home');
    await mkdir(sentryConfigDir, { recursive: true });

    const cwd = tmpDirPath;
    // Resolve variant if needed
    const { buildCommand, assertCommand, testLabel, matchedVariantLabel, runtime } = variantLabel
      ? await getVariantBuildCommand(join(tmpDirPath, 'package.json'), variantLabel, testAppPath)
      : {
          buildCommand: 'pnpm test:build',
          assertCommand: 'pnpm test:assert',
          testLabel: testAppPath,
          runtime: undefined,
        };

    // Print which variant we're using if found
    if (matchedVariantLabel) {
      console.log(`\n\nUsing variant: "${matchedVariantLabel}"\n\n`);
    }

    if (runtime) {
      applyRuntimeFiles(tmpDirPath, runtime);
    }

    const appEnv = {
      ...env,
      SENTRY_CONFIG_DIR: sentryConfigDir,
      ...(runtime ? { RUNTIME: runtime } : {}),
    };

    console.log(`Building ${testLabel} in ${tmpDirPath}...`);
    await asyncExec(buildCommand, { env: appEnv, cwd });

    console.log(`Testing ${testLabel}...`);
    // Pass command as a string to support shell features (env vars, operators like &&)
    // This matches how buildCommand is handled for consistency
    // Properly quote test flags to preserve spaces and special characters
    const quotedTestFlags = testFlags.map(flag => {
      // If flag contains spaces or special shell characters, quote it
      if (flag.includes(' ') || flag.includes('"') || flag.includes("'") || flag.includes('$') || flag.includes('`')) {
        // Escape single quotes and wrap in single quotes (safest for shell)
        return `'${flag.replace(/'/g, "'\\''")}'`;
      }
      return flag;
    });
    const testCommand = `${assertCommand}${quotedTestFlags.length > 0 ? ` ${quotedTestFlags.join(' ')}` : ''}`;
    await asyncExec(testCommand, { env: appEnv, cwd });

    // clean up (although this is tmp, still nice to do)
    await rm(tmpDirPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
