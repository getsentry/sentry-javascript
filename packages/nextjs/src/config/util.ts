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
 * This feature was first introduced in Next.js v15.6.0-canary.36 and marked stable in Next.js v16
 *
 * @param version - version string to check.
 * @returns true if Next.js version supports native debug ids for turbopack builds
 */
export function supportsNativeDebugIds(version: string): boolean {
  if (!version) {
    return false;
  }

  const { major, minor, prerelease } = parseSemver(version);

  if (major === undefined || minor === undefined) {
    return false;
  }

  // Next.js 16+ supports native debug ids
  if (major >= 16) {
    return true;
  }

  // For Next.js 15, check if it's 15.6.0-canary.36+
  if (major === 15 && prerelease?.startsWith('canary.')) {
    // Any canary version 15.7+ supports native debug ids
    if (minor > 6) {
      return true;
    }

    // For 15.6 canary versions, check if it's canary.36 or higher
    if (minor === 6) {
      const canaryNumber = parseInt(prerelease.split('.')[1] || '0', 10);
      if (canaryNumber >= 36) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Determines which bundler is actually being used based on environment variables,
 * and CLI flags.
 *
 * @returns 'turbopack' or 'webpack'
 */
export function detectActiveBundler(): 'turbopack' | 'webpack' {
  const turbopackEnv = process.env.TURBOPACK;

  // Check if TURBOPACK env var is set to a truthy value (excluding falsy strings like 'false', '0', '')
  const isTurbopackEnabled = turbopackEnv && turbopackEnv !== 'false' && turbopackEnv !== '0';

  if (isTurbopackEnabled || process.argv.includes('--turbo')) {
    return 'turbopack';
  } else {
    return 'webpack';
  }
}
