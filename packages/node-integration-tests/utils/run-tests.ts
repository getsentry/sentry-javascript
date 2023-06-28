/* eslint-disable no-console */
import childProcess from 'child_process';
import os from 'os';

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
      const jestProcess = childProcess.spawn('jest', ['--runTestsByPath', testPath as string, '--forceExit']);

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

void Promise.all(workers).then(() => {
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
