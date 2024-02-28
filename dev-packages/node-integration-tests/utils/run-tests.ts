/* eslint-disable no-console */
import childProcess from 'child_process';
import os from 'os';
import path from 'path';
import yargs from 'yargs';

const args = yargs
  .option('t', {
    alias: 'testNamePattern',
    type: 'string',
    description: 'Filter for a specific test spec\nsee: https://jestjs.io/docs/cli#--testnamepatternregex',
  })
  .option('watch', {
    type: 'boolean',
    description: 'Run tests in watch mode\nsee: https://jestjs.io/docs/cli#--watch',
  }).argv;

// This variable will act as a job queue that is consumed by a number of worker threads. Each item represents a test to run.
const testPaths = childProcess.execSync('jest --listTests', { encoding: 'utf8' }).trim().split('\n');

const numTests = testPaths.length;
const fails: string[] = [];
const skips: string[] = [];

function getTestPath(testPath: string): string {
  const cwd = process.cwd();
  return path.relative(cwd, testPath);
}

// We're creating a worker for each CPU core.
const workers = os.cpus().map(async () => {
  const { t, watch } = await args;

  while (testPaths.length > 0) {
    const testPath = testPaths.pop() as string;
    await new Promise<void>(resolve => {
      const jestArgs = ['--runTestsByPath', testPath as string, '--forceExit', '--colors'];

      if (t) {
        jestArgs.push('-t', t);
      }

      if (watch) {
        jestArgs.push('--watch');
      }

      const jestProcess = childProcess.spawn('jest', jestArgs);

      // We're collecting the output and logging it all at once instead of inheriting stdout and stderr, so that
      // test outputs of the individual workers aren't interwoven, in case they print at the same time.
      let output = '';

      jestProcess.stdout.on('data', (data: Buffer) => {
        output = output + data.toString();
      });

      jestProcess.stderr.on('data', (data: Buffer) => {
        output = output + data.toString();
      });

      jestProcess.on('error', error => {
        console.log(`"${getTestPath(testPath)}" finished with error`, error);
        console.log(output);
        fails.push(`FAILED: ${getTestPath(testPath)}`);
        resolve();
      });

      jestProcess.on('exit', exitcode => {
        const hasError = exitcode !== 0;
        const skippedOutput = checkSkippedAllTests(output);

        if (skippedOutput && !hasError) {
          skips.push(`SKIPPED: ${getTestPath(testPath)}`);
        } else {
          console.log(output);
        }

        if (hasError) {
          fails.push(`FAILED: ${getTestPath(testPath)}`);
        }
        resolve();
      });
    });
  }
});

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Promise.all(workers).then(() => {
  console.log('-------------------');

  const failCount = fails.length;
  const skipCount = skips.length;
  const totalCount = numTests;
  const successCount = numTests - failCount - skipCount;
  const nonSkippedCount = totalCount - skipCount;

  if (skips.length) {
    console.log('\x1b[2m%s\x1b[0m', '\nSkipped tests:');
    skips.forEach(skip => {
      console.log('\x1b[2m%s\x1b[0m', `● ${skip}`);
    });
  }

  if (failCount > 0) {
    console.log(
      '\x1b[31m%s\x1b[0m',
      `\n${failCount} of ${nonSkippedCount} tests failed${skipCount ? ` (${skipCount} skipped)` : ''}:\n`,
    );
    fails.forEach(fail => {
      console.log('\x1b[31m%s\x1b[0m', `● ${fail}`);
    });
    process.exit(1);
  } else {
    console.log(
      '\x1b[32m%s\x1b[0m',
      `\nSuccessfully ran ${successCount} tests${skipCount ? ` (${skipCount} skipped)` : ''}.`,
    );
    console.log('\x1b[32m%s\x1b[0m', 'All tests succeeded.');
    process.exit(0);
  }
});

/**
 * Suppress jest output for test suites where all tests were skipped.
 * This only clutters the logs and we can safely print a one-liner instead.
 */
function checkSkippedAllTests(output: string): boolean {
  const regex = /(.+)Tests:(.+)\s+(.+?)(\d+) skipped(.+), (\d+) total/gm;
  const matches = regex.exec(output);

  if (matches) {
    const skipped = Number(matches[4]);
    const total = Number(matches[6]);
    if (!isNaN(skipped) && !isNaN(total) && total === skipped) {
      return true;
    }
  }

  return false;
}
