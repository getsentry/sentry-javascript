import * as glob from 'glob';
import * as path from 'path';
import * as childProcess from 'child_process';

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

  let runCount: number;
  if (process.env.TEST_RUN_COUNT === 'AUTO') {
    // No test paths detected: run everything 5x
    runCount = 5;

    if (testPaths.length > 0) {
      // Run everything up to 100x, assuming that total runtime is less than 60min.
      // We assume an average runtime of 3s per test, times 4 (for different browsers) = 12s per detected testPaths
      // We want to keep overall runtime under 30min
      const testCount = testPaths.length * 4;
      const expectedRuntimePerTestPath = testCount * 3;
      const expectedRuntime = Math.floor((30 * 60) / expectedRuntimePerTestPath);
      runCount = Math.min(50, Math.max(expectedRuntime, 5));
    }
  } else {
    runCount = parseInt(process.env.TEST_RUN_COUNT || '10');
  }

  const cwd = path.join(__dirname, '../');

  try {
    await new Promise<void>((resolve, reject) => {
      const cp = childProcess.spawn(
        `yarn playwright test ${
          testPaths.length ? testPaths.join(' ') : './suites'
        } --reporter='line' --repeat-each ${runCount}`,
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

run();
