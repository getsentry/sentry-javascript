/* eslint-disable no-console */

import { constructRecipeInstances } from './constructRecipeInstances';
import { buildAndTestApp } from './runTestApp';
import type { RecipeInstance, RecipeTestResult } from './types';

export async function runAllTestApps(
  recipePaths: string[],
  envVarsToInject: Record<string, string | undefined>,
): Promise<void> {
  const maxParallel = process.env.CI ? 2 : 4; // For now we are disabling parallel execution because it was causing problems (runners were too slow and timeouts happened)

  const recipeInstances = constructRecipeInstances(recipePaths);

  const results = await shardPromises(
    recipeInstances,
    recipeInstance => buildAndTestApp(recipeInstance, envVarsToInject),
    maxParallel,
  );

  console.log('--------------------------------------');
  console.log('Test Result Summary:');

  results.forEach(result => {
    if (result.buildFailed) {
      console.log(`● BUILD FAILED - ${result.label} (${result.recipe.path}`);
    } else {
      console.log(`● BUILD SUCCEEDED - ${result.label}`);
      result.tests.forEach(testResult => {
        console.log(`  ● ${testResult.result.padEnd(7, ' ')} ${testResult.testName}`);
      });
    }
  });

  const failed = results.filter(result => result.buildFailed || result.testFailed);

  if (failed.length) {
    console.log(`${failed.length} test(s) failed.`);
    process.exit(1);
  }

  console.log('All tests succeeded. 🎉');
}

// Always run X promises at a time
function shardPromises(
  recipes: RecipeInstance[],
  callback: (recipe: RecipeInstance) => Promise<RecipeTestResult>,
  maxParallel: number,
): Promise<RecipeTestResult[]> {
  return new Promise(resolve => {
    console.log(`Running a total of ${recipes.length} jobs, with up to ${maxParallel} jobs in parallel...`);
    const results: RecipeTestResult[] = [];
    const remaining = recipes.slice();
    const running: Promise<unknown>[] = [];

    function runNext(): void {
      if (running.length < maxParallel && remaining.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const next = remaining.shift()!;
        const promise = callback(next);

        console.log(`Running job ${next.label}, ${remaining.length} remaining...`);

        running.push(promise);

        promise
          .then(result => results.push(result))
          .finally(() => {
            const pos = running.indexOf(promise);
            running.splice(pos, 1);

            runNext();
          });
      } else if (remaining.length === 0 && running.length === 0) {
        resolve(results);
      }
    }

    // Initial runs
    for (let i = 0; i < maxParallel; i++) {
      runNext();
    }
  });
}
