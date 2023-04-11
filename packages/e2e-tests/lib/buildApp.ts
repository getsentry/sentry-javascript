/* eslint-disable no-console */

import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { DEFAULT_BUILD_TIMEOUT_SECONDS } from './constants';
import type { Env, RecipeInstance } from './types';
import { prefixObjectKeys, spawnAsync } from './utils';

export async function buildApp(appDir: string, recipeInstance: RecipeInstance, envVars: Env): Promise<void> {
  const { recipe, label, dependencyOverrides } = recipeInstance;

  const packageJsonPath = path.resolve(appDir, 'package.json');

  if (dependencyOverrides) {
    // Override dependencies
    const packageJson: { dependencies?: Record<string, string> } = JSON.parse(
      fs.readFileSync(packageJsonPath, { encoding: 'utf-8' }),
    );
    packageJson.dependencies = packageJson.dependencies
      ? { ...packageJson.dependencies, ...dependencyOverrides }
      : dependencyOverrides;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), {
      encoding: 'utf-8',
    });
  }

  if (recipe.buildCommand) {
    console.log(`Running build command for test application "${label}"`);

    fs.mkdirSync(path.join(os.tmpdir(), 'e2e-test-yarn-caches'), { recursive: true });
    const tempYarnCache = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-test-yarn-caches', 'cache-'));

    const env = {
      ...process.env,
      ...envVars,
      YARN_CACHE_FOLDER: tempYarnCache, // Use a separate yarn cache for each build commmand because multiple yarn commands running at the same time may corrupt the cache
    };

    const buildResult = await spawnAsync(recipe.buildCommand, {
      cwd: appDir,
      timeout: (recipe.buildTimeoutSeconds ?? DEFAULT_BUILD_TIMEOUT_SECONDS) * 1000,
      env: {
        ...env,
        ...prefixObjectKeys(env, 'NEXT_PUBLIC_'),
        ...prefixObjectKeys(env, 'REACT_APP_'),
      },
    });

    if (buildResult.error) {
      console.log(`Build failed for test application "${label}"`);

      // Prepends some text to the output build command's output so we can distinguish it from logging in this script
      console.log(buildResult.stdout.replace(/^/gm, '  [BUILD OUTPUT] '));
      console.log(buildResult.stderr.replace(/^/gm, '  [BUILD OUTPUT] '));

      console.log('[BUILD ERROR] ', buildResult.error);
      throw buildResult.error;
    }

    if (recipe.buildAssertionCommand) {
      console.log(`Running build assertion for test application "${label}"`);

      const buildAssertionResult = await spawnAsync(
        recipe.buildAssertionCommand,
        {
          cwd: appDir,
          timeout: (recipe.buildTimeoutSeconds ?? DEFAULT_BUILD_TIMEOUT_SECONDS) * 1000,
          env: {
            ...env,
            ...prefixObjectKeys(env, 'NEXT_PUBLIC_'),
            ...prefixObjectKeys(env, 'REACT_APP_'),
          },
        },
        buildResult.stdout,
      );

      if (buildAssertionResult.error) {
        console.log(`Build assertion failed for test application "${label}"`);

        // Prepends some text to the output build command's output so we can distinguish it from logging in this script
        console.log(buildAssertionResult.stdout.replace(/^/gm, '  [BUILD ASSERTION OUTPUT] '));
        console.log(buildAssertionResult.stderr.replace(/^/gm, '  [BUILD ASSERTION OUTPUT] '));

        console.log('[BUILD ASSERTION ERROR] ', buildAssertionResult.error);

        throw buildAssertionResult.error;
      }
    }
  }
}
