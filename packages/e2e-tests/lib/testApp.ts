/* eslint-disable no-console */

import { DEFAULT_TEST_TIMEOUT_SECONDS } from './constants';
import type { Env, RecipeInstance, TestDef, TestResult } from './types';
import { spawnAsync } from './utils';

export async function testApp(appDir: string, recipeInstance: RecipeInstance, env: Env): Promise<TestResult[]> {
  const { recipe } = recipeInstance;

  const results: TestResult[] = [];
  for (const test of recipe.tests) {
    results.push(await runTest(appDir, recipeInstance, test, env));
  }

  return results;
}

async function runTest(appDir: string, recipeInstance: RecipeInstance, test: TestDef, env: Env): Promise<TestResult> {
  const { recipe, label } = recipeInstance;
  console.log(`Running test command for test application "${label}", test "${test.testName}"`);

  const testResult = await spawnAsync(test.testCommand, {
    cwd: appDir,
    timeout: (recipe.testTimeoutSeconds ?? DEFAULT_TEST_TIMEOUT_SECONDS) * 1000,
    env: {
      ...process.env,
      ...env,
    } as unknown as NodeJS.ProcessEnv,
  });

  if (testResult.error) {
    console.log(`Test failed for test application "${label}", test "${test.testName}"`);

    // Prepends some text to the output test command's output so we can distinguish it from logging in this script
    console.log(testResult.stdout.replace(/^/gm, '  [TEST OUTPUT] '));
    console.log(testResult.stderr.replace(/^/gm, '  [TEST OUTPUT] '));

    console.log('[TEST ERROR] ', testResult.error);

    return {
      testName: test.testName,
      result: testResult.error?.message.includes('ETDIMEDOUT') ? 'TIMEOUT' : 'FAIL',
    };
  }

  return {
    testName: test.testName,
    result: 'PASS',
  };
}
