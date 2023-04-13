/* eslint-disable no-console */

import * as fs from 'fs-extra';
import * as path from 'path';

import { buildApp } from './buildApp';
import { TMP_DIR } from './constants';
import { testApp } from './testApp';
import type { Env, RecipeInstance, RecipeTestResult } from './types';

let tmpDirCount = 0;

// This should never throw, we always return a result here
export async function buildAndTestApp(
  recipeInstance: RecipeInstance,
  envVarsToInject: Record<string, string | undefined>,
): Promise<RecipeTestResult> {
  const { recipe, portModulo, portGap } = recipeInstance;
  const recipeDirname = path.dirname(recipe.path);

  const targetDir = path.join(TMP_DIR, `${recipe.testApplicationName}-${tmpDirCount++}`);

  await fs.copy(recipeDirname, targetDir);

  const env: Env = {
    ...envVarsToInject,
    PORT_MODULO: portModulo.toString(),
    PORT_GAP: portGap.toString(),
  };

  try {
    await buildApp(targetDir, recipeInstance, env);
  } catch (error) {
    await fs.remove(targetDir);

    return {
      ...recipeInstance,
      buildFailed: true,
      testFailed: false,
      tests: [],
    };
  }

  // This cannot throw, we always return a result here
  const results = await testApp(targetDir, recipeInstance, env);

  // Cleanup
  await fs.remove(targetDir);

  return {
    ...recipeInstance,
    buildFailed: false,
    testFailed: results.some(result => result.result !== 'PASS'),
    tests: results,
  };
}
