/* eslint-disable no-console */
import childProcess from 'child_process';
import os from 'os';
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

// We're creating a worker for each CPU core.
const workers = os.cpus().map(async (_, i) => {
  while (testPaths.length > 0) {
    const testPath = testPaths.pop();
    console.log(`(Worker ${i}) Running test "${testPath}"`);
    await new Promise<void>(resolve => {
      const jestArgs = ['--runTestsByPath', testPath as string, '--forceExit'];

      if (args.t) {
        jestArgs.push('-t', args.t);
      }

      if (args.watch) {
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
        console.log(output);
        console.log(`(Worker ${i}) Error in test "${testPath}"`, error);
        fails.push(`FAILED: "${testPath}"`);
        resolve();
      });

      jestProcess.on('exit', exitcode => {
        output = checkSkippedAllTests(output, i, testPath);
        console.log(`(Worker ${i}) Finished test "${testPath}"`);
        console.log(output);
        if (exitcode !== 0) {
          fails.push(`FAILED: "${testPath}"`);
        }
        resolve();
      });
    });
  }
});

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Promise.all(workers).then(() => {
  console.log('-------------------');
  console.log(`Successfully ran ${numTests} tests.`);
  if (fails.length > 0) {
    console.log('Not all tests succeeded:\n');
    fails.forEach(fail => {
      console.log(`● ${fail}`);
    });
    process.exit(1);
  } else {
    console.log('All tests succeeded.');
    process.exit(0);
  }
});

/**
 * Suppress jest output for test suites where all tests were skipped.
 * This only clutters the logs and we can safely print a one-liner instead.
 */
function checkSkippedAllTests(output: string, workerNumber: number, testPath: string | undefined): string {
  const regex = /Tests:\s+(\d+) skipped, (\d+) total/gm;
  const matches = regex.exec(output);
  if (matches) {
    const skipped = Number(matches[1]);
    const total = Number(matches[2]);
    if (!isNaN(skipped) && !isNaN(total) && total === skipped) {
      return `(Worker ${workerNumber}) > Skipped all (${total} tests) in ${testPath}`;
    }
  }
  return output;
}
