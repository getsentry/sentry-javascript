import * as glob from 'glob';
import * as path from 'path';
import * as childProcess from 'child_process';
import { promisify } from 'util';

const exec = promisify(childProcess.exec);

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

  const cwd = path.join(__dirname, '../');
  const runCount = parseInt(process.env.TEST_RUN_COUNT || '10');

  try {
    await new Promise<void>((resolve, reject) => {
      const cp = childProcess.spawn(
        `yarn playwright test ${
          testPaths.length ? testPaths.join(' ') : './suites'
        } --browser='all' --reporter='line' --repeat-each ${runCount}`,
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
