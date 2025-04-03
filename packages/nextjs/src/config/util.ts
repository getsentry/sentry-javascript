import { GLOBAL_OBJ } from '@sentry/core';
import * as fs from 'fs';
import { sync as resolveSync } from 'resolve';

/**
 * Returns the version of Next.js installed in the project, or undefined if it cannot be determined.
 */
export function getNextjsVersion(): string | undefined {
  const nextjsPackageJsonPath = resolveNextjsPackageJson();
  if (nextjsPackageJsonPath) {
    try {
      const nextjsPackageJson: { version: string } = JSON.parse(
        fs.readFileSync(nextjsPackageJsonPath, { encoding: 'utf-8' }),
      );
      return nextjsPackageJson.version;
    } catch {
      // noop
    }
  }

  return undefined;
}

function resolveNextjsPackageJson(): string | undefined {
  try {
    return resolveSync('next/package.json', { basedir: process.cwd() });
  } catch {
    return undefined;
  }
}

/**
 * Leaves a mark on the global scope in the Next.js build context that webpack has been executed.
 */
export function setWebpackBuildFunctionCalled(): void {
  // Let the rest of the execution context know that we are using Webpack to build.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  (GLOBAL_OBJ as any)._sentryWebpackBuildFunctionCalled = true;
}

/**
 * Checks whether webpack has been executed fot the current Next.js build.
 */
export function getWebpackBuildFunctionCalled(): boolean {
  // Let the rest of the execution context know that we are using Webpack to build.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  return !!(GLOBAL_OBJ as any)._sentryWebpackBuildFunctionCalled;
}
