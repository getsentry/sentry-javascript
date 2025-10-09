import { parseSemver } from '@sentry/core';
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
 * Checks if the current Next.js version supports the runAfterProductionCompile hook.
 * This hook was introduced in Next.js 15.4.1. (https://github.com/vercel/next.js/pull/77345)
 *
 * @param version - version string to check.
 * @returns true if Next.js version is 15.4.1 or higher
 */
export function supportsProductionCompileHook(version: string): boolean {
  const versionToCheck = version;
  if (!versionToCheck) {
    return false;
  }

  const { major, minor, patch } = parseSemver(versionToCheck);

  if (major === undefined || minor === undefined || patch === undefined) {
    return false;
  }

  if (major > 15) {
    return true;
  }

  // For major version 15, check if it's 15.4.1 or higher
  if (major === 15) {
    if (minor > 4) {
      return true;
    }
    if (minor === 4 && patch >= 1) {
      return true;
    }
    return false;
  }

  return false;
}

/**
 * Checks if the current Next.js version supports native debug ids for turbopack.
 * This feature was first introduced in Next.js v15.6.0-canary.36
 *
 * @param version - version string to check.
 * @returns true if Next.js version supports native debug ids for turbopack builds
 */
export function supportsNativeDebugIds(version: string): boolean {
  // tbd
  if (version === '15.6.0-canary.36') {
    return true;
  }
  return false;
}
