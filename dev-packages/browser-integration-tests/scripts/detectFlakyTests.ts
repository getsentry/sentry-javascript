import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';

/**
 * The number of browsers we run the tests in.
 */
const NUM_BROWSERS = 3;

/**
 * Assume that each test runs for 2s.
 */
const ASSUMED_TEST_DURATION_SECONDS = 2;

/**
 * We keep the runtime of the detector if possible under 30min.
 */
const MAX_TARGET_TEST_RUNTIME_SECONDS = 30 * 60;

/**
 * Running one test 50x is what we consider enough to detect flakiness.
 * Running one test 5x is the bare minimum
 */
const MAX_PER_TEST_RUN_COUNT = 50;
const MIN_PER_TEST_RUN_COUNT = 5;

async function run(): Promise<void> {
  let testPaths: string[] = [];

  const changedPaths: string[] = process.env.CHANGED_TEST_PATHS ? JSON.parse(process.env.CHANGED_TEST_PATHS) : [];

  if (changedPaths.length > 0) {
    console.log(`Detected changed test paths:
${changedPaths.join('\n')}

`);

    testPaths = getTestPaths().filter(p => changedPaths.some(changedPath => changedPath.includes(p)));
    if (testPaths.length === 0) {
      console.log('Could not find matching tests, aborting...');
      process.exit(1);
    }
  }

  const repeatEachCount = getPerTestRunCount(testPaths);
  console.log(`Running tests ${repeatEachCount} times each.`);

  const cwd = path.join(__dirname, '../');

  try {
    await new Promise<void>((resolve, reject) => {
      const cp = childProcess.spawn(
        `npx playwright test ${
          testPaths.length ? testPaths.join(' ') : './suites'
        } --reporter='line' --repeat-each ${repeatEachCount}`,
        { shell: true, cwd },
      );

      let error: Error | undefined;

      cp.stdout.on('data', data => {
        console.log(data ? (data as object).toString() : '');
      });

      cp.stderr.on('data', data => {
        console.log(data ? (data as object).toString() : '');
      });

      cp.on('error', e => {
        console.error(e);
        error = e;
      });

      cp.on('close', status => {
        const err = error || (status !== 0 ? new Error(`Process exited with status ${status}`) : undefined);

        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  } catch (error) {
    console.log('');
    console.log('');

    console.error(`⚠️ Some tests failed.`);
    console.error(error);
    process.exit(1);
  }

  console.log('');
  console.log('');
  console.log(`☑️ All tests passed.`);
}

/**
 * Returns how many time one test should run based on the chosen mode and a bunch of heuristics
 */
function getPerTestRunCount(testPaths: string[]) {
  if ((!process.env.TEST_RUN_COUNT || process.env.TEST_RUN_COUNT === 'AUTO') && testPaths.length > 0) {
    // Run everything up to 100x, assuming that total runtime is less than 60min.
    // We assume an average runtime of 3s per test, times 4 (for different browsers) = 12s per detected testPaths
    // We want to keep overall runtime under 30min
    const estimatedNumberOfTests = testPaths.map(getApproximateNumberOfTests).reduce((a, b) => a + b);
    console.log(`Estimated number of tests: ${estimatedNumberOfTests}`);

    // tests are usually run against all browsers we test with, so let's assume this
    const testRunCount = estimatedNumberOfTests * NUM_BROWSERS;
    console.log(`Estimated test runs for one round: ${testRunCount}`);

    const estimatedTestRuntime = testRunCount * ASSUMED_TEST_DURATION_SECONDS;
    console.log(`Estimated test runtime: ${estimatedTestRuntime}s`);

    const expectedPerTestRunCount = Math.floor(MAX_TARGET_TEST_RUNTIME_SECONDS / estimatedTestRuntime);
    console.log(`Expected per-test run count: ${expectedPerTestRunCount}`);

    return Math.min(MAX_PER_TEST_RUN_COUNT, Math.max(expectedPerTestRunCount, MIN_PER_TEST_RUN_COUNT));
  }

  return parseInt(process.env.TEST_RUN_COUNT || '5');
}

function getTestPaths(): string[] {
  const paths = glob.sync('suites/**/test.{ts,js}', {
    cwd: path.join(__dirname, '../'),
  });

  return paths.map(p => path.dirname(p));
}

function logError(error: unknown) {
  if (process.env.CI) {
    console.log('::group::Test failed');
  } else {
    console.error(' ⚠️ Test failed:');
  }

  console.log((error as any).stdout);
  console.log((error as any).stderr);

  if (process.env.CI) {
    console.log('::endgroup::');
  }
}

/**
 * Definitely not bulletproof way of getting the number of tests in a file :D
 * We simply match on `it(`, `test(`, etc and count the matches.
 *
 * Note: This test completely disregards parameterized tests (`it.each`, etc) or
 * skipped/disabled tests and other edge cases. It's just a rough estimate.
 */
function getApproximateNumberOfTests(testPath: string): number {
  try {
    const content = fs.readFileSync(path.join(process.cwd(), testPath, 'test.ts'), 'utf-8');
    const matches = content.match(/it\(|test\(|sentryTest\(/g);
    return Math.max(matches ? matches.length : 1, 1);
  } catch (e) {
    console.error(`Could not read file ${testPath}`);
    return 1;
  }
}

run();
