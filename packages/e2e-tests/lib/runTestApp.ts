import * as fs from 'fs';
import * as fsExtra from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { buildApp } from './buildApp';
import { testApp } from './testApp';
import type { Env, RecipeInstance, RecipeTestResult } from './types';

// This should never throw, we always return a result here
export async function buildAndTestApp(
  recipeInstance: RecipeInstance,
  envVarsToInject: Record<string, string | undefined>,
): Promise<RecipeTestResult> {
  const { recipe, portModulo, portGap } = recipeInstance;
  const recipeDirname = path.dirname(recipe.path);

  const targetDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'e2e-test-temp-app-dir-'));

  await fsExtra.copy(recipeDirname, targetDir);

  const env: Env = {
    ...envVarsToInject,
    PORT_MODULO: portModulo.toString(),
    PORT_GAP: portGap.toString(),
  };

  try {
    await buildApp(targetDir, recipeInstance, env);
  } catch (error) {
    await fsExtra.remove(targetDir);

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
  await fsExtra.remove(targetDir);

  return {
    ...recipeInstance,
    buildFailed: false,
    testFailed: results.some(result => result.result !== 'PASS'),
    tests: results,
  };
}
