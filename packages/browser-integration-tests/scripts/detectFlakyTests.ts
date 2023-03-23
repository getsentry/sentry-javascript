import * as glob from 'glob';
import * as path from 'path';
import * as childProcess from 'child_process';
import { promisify } from 'util';

const exec = promisify(childProcess.exec);

async function run(): Promise<void> {
  let testPaths = getTestPaths();
  let failed = [];

  try {
    const changedPaths: string[] = process.env.CHANGED_TEST_PATHS ? JSON.parse(process.env.CHANGED_TEST_PATHS) : [];

    if (changedPaths.length > 0) {
      console.log(`Detected changed test paths:
${changedPaths.join('\n')}

`);

      testPaths = testPaths.filter(p => changedPaths.some(changedPath => changedPath.includes(p)));
    }
  } catch {
    console.log('Could not detect changed test paths, running all tests.');
  }

  const cwd = path.join(__dirname, '../');
  const runCount = parseInt(process.env.TEST_RUN_COUNT || '10');

  for (const testPath of testPaths) {
    console.log(`Running test: ${testPath}`);
    const start = Date.now();

    try {
      await exec(`yarn playwright test ${testPath} --browser='all' --repeat-each ${runCount}`, {
        cwd,
      });
      const end = Date.now();
      console.log(`  ☑️  Passed ${runCount} times, avg. duration ${Math.ceil((end - start) / runCount)}ms`);
    } catch (error) {
      logError(error);
      failed.push(testPath);
    }
  }

  console.log('');
  console.log('');

  if (failed.length > 0) {
    console.error(`⚠️ ${failed.length} test(s) failed.`);
    process.exit(1);
  } else {
    console.log(`☑️ ${testPaths.length} test(s) passed.`);
  }
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
