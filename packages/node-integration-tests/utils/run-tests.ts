/* eslint-disable no-console */
import childProcess from 'child_process';
import os from 'os';

const testPaths = childProcess.execSync('jest --listTests', { encoding: 'utf8' }).trim().split('\n');

let testsSucceeded = true;
const testAmount = testPaths.length;
const fails: string[] = [];

const threads = os.cpus().map(async (_, i) => {
  let testPath = testPaths.pop();
  while (testPath !== undefined) {
    console.log(`(Worker ${i}) Running test "${testPath}"`);
    await new Promise(resolve => {
      const p = childProcess.spawn('jest', ['--runTestsByPath', testPath as string, '--forceExit'], {
        // These env vars are used to give workers a limited, non-overlapping set of ports to occupy.
        // This is done to avoid race-conditions during port reservation.
        env: { ...process.env, TEST_WORKERS_AMOUNT: String(os.cpus().length), TEST_PORT_MODULO: String(i) },
      });

      let output = '';

      p.stdout.on('data', (data: Buffer) => {
        output = output + data.toString();
      });

      p.stderr.on('data', (data: Buffer) => {
        output = output + data.toString();
      });

      p.on('error', error => {
        console.log(`(Worker ${i}) Error in test "${testPath}"`, error);
        console.log(output);
        resolve();
      });

      p.on('exit', exitcode => {
        console.log(`(Worker ${i}) Finished test "${testPath}"`);
        console.log(output);
        if (exitcode !== 0) {
          fails.push(`FAILED: "${testPath}"`);
          testsSucceeded = false;
        }
        resolve();
      });
    });
    testPath = testPaths.pop();
  }
});

void Promise.all(threads).then(() => {
  console.log('-------------------');
  console.log(`Successfully ran ${testAmount} tests.`);
  if (!testsSucceeded) {
    console.log('Not all tests succeeded:\n');
    fails.forEach(fail => {
      console.log(`● ${fail}`);
    });
    process.exit(1);
  } else {
    console.log('All testcases returned the expected results.');
    process.exit(0);
  }
});
