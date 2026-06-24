import { exec } from 'child_process';
import { existsSync } from 'fs';
import { cp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { promisify } from 'util';
import { afterAll, beforeAll, test, type TestAPI } from 'vitest';
import { createRunner } from './createRunner';

const execPromise = promisify(exec);

export function createEsmAndCjsTests(
  cwd: string,
  scenarioPath: string,
  instrumentPath: string,
  callback: (
    createTestRunner: () => ReturnType<typeof createRunner>,
    testFn: typeof test | typeof test.fails,
    mode: 'esm' | 'cjs',
    cwd: string,
  ) => void,
  options?: {
    failsOnCjs?: boolean;
    failsOnEsm?: boolean;
    /**
     * `additionalDependencies` to install in a tmp dir for the esm and cjs tests
     * This could be used to override packages that live in the parent package.json for the specific run of the test
     * e.g. `{ ai: '^5.0.0' }` to test Vercel AI v5
     */
    additionalDependencies?: Record<string, string>;
    /** Copy these files/dirs into the tmp dir. */
    copyPaths?: string[];
  },
): void {
  const mjsScenarioPath = join(cwd, scenarioPath);
  const mjsInstrumentPath = join(cwd, instrumentPath);

  if (!mjsScenarioPath.endsWith('.mjs')) {
    throw new Error(`Scenario path must end with .mjs: ${scenarioPath}`);
  }

  if (!existsSync(mjsInstrumentPath)) {
    throw new Error(`Instrument file not found: ${mjsInstrumentPath}`);
  }

  // Create a dedicated tmp directory that includes copied ESM & CJS scenario/instrument files.
  // If additionalDependencies are provided, we also create a nested package.json and install them there.
  const uniqueId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const tmpDirPath = join(cwd, `tmp_${uniqueId}`);
  const esmScenarioBasename = basename(scenarioPath);
  const esmInstrumentBasename = basename(instrumentPath);
  const esmScenarioPathForRun = join(tmpDirPath, esmScenarioBasename);
  const esmInstrumentPathForRun = join(tmpDirPath, esmInstrumentBasename);
  const cjsScenarioPath = join(tmpDirPath, esmScenarioBasename.replace('.mjs', '.cjs'));
  const cjsInstrumentPath = join(tmpDirPath, esmInstrumentBasename.replace('.mjs', '.cjs'));

  async function createTmpDir(): Promise<void> {
    await mkdir(tmpDirPath);

    // Copy ESM files as-is into tmp dir
    await writeFile(esmScenarioPathForRun, await readFile(mjsScenarioPath, 'utf8'));
    await writeFile(esmInstrumentPathForRun, await readFile(mjsInstrumentPath, 'utf8'));

    // Pre-create CJS converted files inside tmp dir
    await convertEsmFileToCjs(esmScenarioPathForRun, cjsScenarioPath);
    await convertEsmFileToCjs(esmInstrumentPathForRun, cjsInstrumentPath);

    // Copy any additional files/dirs into tmp dir
    if (options?.copyPaths) {
      for (const path of options.copyPaths) {
        await cp(join(cwd, path), join(tmpDirPath, path), { recursive: true });
      }
    }

    // Create a minimal package.json with requested dependencies (if any) and install them
    const additionalDependencies = options?.additionalDependencies ?? {};
    if (Object.keys(additionalDependencies).length > 0) {
      const packageJson = {
        name: 'tmp-integration-test',
        private: true,
        version: '0.0.0',
        dependencies: additionalDependencies,
      } as const;

      await writeFile(join(tmpDirPath, 'package.json'), JSON.stringify(packageJson, null, 2));

      const deps = Object.entries(additionalDependencies).map(([name, range]) => {
        if (!range || typeof range !== 'string') {
          throw new Error(`Invalid version range for "${name}": ${String(range)}`);
        }
        return `${name}@${range}`;
      });

      if (deps.length > 0) {
        // Prefer npm for temp installs to avoid Yarn engine strictness; see https://github.com/vercel/ai/issues/7777
        await npmInstallWithRetry(tmpDirPath, deps);
      }
    }
  }

  const esmTestFn = options?.failsOnEsm ? wrapTestApi(test.fails, 'esm - fails') : wrapTestApi(test, 'esm');
  const cjsTestFn = options?.failsOnCjs ? wrapTestApi(test.fails, 'cjs - fails') : wrapTestApi(test, 'cjs');

  // Track the runners created by this invocation so we can tear down only their resources in
  // `afterAll` — rather than clearing the global `CLEANUP_STEPS`, which would also kill child
  // processes, docker containers and mock servers owned by sibling suites in the same worker.
  const createdRunners = new Set<ReturnType<typeof createRunner>>();
  function trackRunner(runner: ReturnType<typeof createRunner>): ReturnType<typeof createRunner> {
    createdRunners.add(runner);
    return runner;
  }

  callback(
    () => trackRunner(createRunner(esmScenarioPathForRun).withFlags('--import', esmInstrumentPathForRun)),
    esmTestFn,
    'esm',
    tmpDirPath,
  );

  callback(
    () => trackRunner(createRunner(cjsScenarioPath).withFlags('--require', cjsInstrumentPath)),
    cjsTestFn,
    'cjs',
    tmpDirPath,
  );

  // Create tmp directory and install additionalDependencies (with retries)
  beforeAll(async () => {
    await createTmpDir();
  }, 120_000);

  // Clean up the tmp directory after both esm and cjs suites have run
  afterAll(async () => {
    // First do cleanup — but only of the runners this invocation created!
    for (const runner of createdRunners) {
      runner.cleanup();
    }
    createdRunners.clear();

    try {
      await rm(tmpDirPath, { recursive: true, force: true });
    } catch {
      if (process.env.DEBUG) {
        // eslint-disable-next-line no-console
        console.error(`Failed to remove tmp dir: ${tmpDirPath}`);
      }
    }
  }, 30_000);
}

async function convertEsmFileToCjs(inputPath: string, outputPath: string): Promise<void> {
  const cjsFileContent = await readFile(inputPath, 'utf8');
  const cjsFileContentConverted = convertEsmToCjs(cjsFileContent);
  return writeFile(outputPath, cjsFileContentConverted);
}

/**
 * Converts ESM import statements to CommonJS require statements
 * @param content The content of an ESM file
 * @returns The content with require statements instead of imports
 */
function convertEsmToCjs(content: string): string {
  let newContent = content;

  // Handle default imports: import x from 'y' -> const x = require('y')
  newContent = newContent.replace(
    // eslint-disable-next-line regexp/optimal-quantifier-concatenation, regexp/no-super-linear-backtracking
    /import\s+([\w*{}\s,]+)\s+from\s+['"]([^'"]+)['"]/g,
    (_, imports: string, module: string) => {
      if (imports.includes('* as')) {
        // Handle namespace imports: import * as x from 'y' -> const x = require('y')
        return `const ${imports.replace('* as', '').trim()} = require('${module}')`;
      } else if (imports.includes('{')) {
        // Handle named imports: import {x, y} from 'z' -> const {x, y} = require('z')
        return `const ${imports} = require('${module}')`;
      } else {
        // Handle default imports: import x from 'y' -> const x = require('y')
        return `const ${imports} = require('${module}')`;
      }
    },
  );

  // Handle side-effect imports: import 'x' -> require('x')
  newContent = newContent.replace(/import\s+['"]([^'"]+)['"]/g, (_, module) => {
    return `require('${module}')`;
  });

  return newContent;
}

const NPM_INSTALL_MAX_RETRIES = 3;
const NPM_INSTALL_RETRY_DELAY_MS = 2_000;

async function npmInstallWithRetry(cwd: string, deps: string[]): Promise<void> {
  for (let attempt = 1; attempt <= NPM_INSTALL_MAX_RETRIES; attempt++) {
    try {
      const { stdout, stderr } = await execPromise('npm install --prefer-offline --silent --no-audit --no-fund', {
        cwd,
        encoding: 'utf8',
      });

      if (process.env.DEBUG) {
        // eslint-disable-next-line no-console
        console.log('[additionalDependencies via npm]', deps.join(' '));
        // eslint-disable-next-line no-console
        console.log('[npm stdout]', stdout);
        // eslint-disable-next-line no-console
        console.log('[npm stderr]', stderr);
      }
      return;
    } catch (error) {
      if (attempt < NPM_INSTALL_MAX_RETRIES) {
        // eslint-disable-next-line no-console
        console.warn(
          `npm install attempt ${attempt}/${NPM_INSTALL_MAX_RETRIES} failed, retrying in ${NPM_INSTALL_RETRY_DELAY_MS}ms...`,
        );
        await new Promise(resolve => setTimeout(resolve, NPM_INSTALL_RETRY_DELAY_MS));
      } else {
        throw new Error(
          `Failed to install additionalDependencies in tmp dir ${cwd} after ${NPM_INSTALL_MAX_RETRIES} attempts: ${error}`,
        );
      }
    }
  }
}

// Wrap the test API so it prepends the test name with the mode
// Also wraps the nested fields `only`, `skip`, `each`, and `for`
function wrapTestApi(api: TestAPI | typeof test.fails | typeof test.only | typeof test.skip, suffix: string) {
  return new Proxy(api, {
    apply: (target, thisArg, args: Parameters<typeof api>) => {
      if (typeof args[0] === 'string') {
        args[0] = `${args[0]} [${suffix}]`;
      }

      return Reflect.apply(target, thisArg, args);
    },

    get: (target, prop: 'only' | 'skip' | 'each' | 'for') => {
      if (prop === 'only' || prop === 'skip') {
        return wrapTestApi(target[prop], suffix);
      }

      if (prop === 'each' || prop === 'for') {
        return wrapTestEachApi(target[prop], suffix);
      }

      return Reflect.get(target, prop);
    },
  });
}

// For test.each, we can't just wrap the function itself, but need to wrap the returned function
// As usage is e.g. test.each(...)('test name', () => {})
function wrapTestEachApi<Api extends typeof test.each | typeof test.for>(api: Api, suffix: string) {
  return new Proxy(api, {
    apply: (target, thisArg, args: Parameters<typeof api>) => {
      const res = Reflect.apply(target, thisArg, args);

      return new Proxy(res, {
        apply: (target, thisArg, args: Parameters<ReturnType<typeof test.each>>) => {
          if (typeof args[0] === 'string') {
            args[0] = `${args[0]} [${suffix}]`;
          }
          return Reflect.apply(target, thisArg, args);
        },
      });
    },
  });
}
