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
 * Checks if the current Next.js version uses Turbopack as the default bundler.
 * Starting from Next.js 15.6.0-canary.38, turbopack became the default for `next build`.
 *
 * @param version - Next.js version string to check.
 * @returns true if the version uses Turbopack by default
 */
export function isTurbopackDefaultForVersion(version: string): boolean {
  if (!version) {
    return false;
  }

  const { major, minor, prerelease } = parseSemver(version);

  if (major === undefined || minor === undefined) {
    return false;
  }

  // Next.js 16+ uses turbopack by default
  if (major >= 16) {
    return true;
  }

  // For Next.js 15, only canary versions 15.6.0-canary.40+ use turbopack by default
  // Stable 15.x releases still use webpack by default
  if (major === 15 && minor >= 6 && prerelease && prerelease.startsWith('canary.')) {
    if (minor >= 7) {
      return true;
    }
    const canaryNumber = parseInt(prerelease.split('.')[1] || '0', 10);
    if (canaryNumber >= 40) {
      return true;
    }
  }

  return false;
}

/**
 * Determines which bundler is actually being used based on environment variables,
 * CLI flags, and Next.js version.
 *
 * @param nextJsVersion - The Next.js version string
 * @returns 'turbopack', 'webpack', or undefined if it cannot be determined
 */
export function detectActiveBundler(nextJsVersion: string | undefined): 'turbopack' | 'webpack' | undefined {
  if (process.env.TURBOPACK || process.argv.includes('--turbo')) {
    return 'turbopack';
  }

  // Explicit opt-in to webpack via --webpack flag
  if (process.argv.includes('--webpack')) {
    return 'webpack';
  }

  // Explicit opt-in to webpack (using rspack) via environment variable
  if (process.env.NEXT_RSPACK === 'true') {
    return 'webpack';
  }

  // Fallback to version-based default behavior
  if (nextJsVersion) {
    const turbopackIsDefault = isTurbopackDefaultForVersion(nextJsVersion);
    return turbopackIsDefault ? 'turbopack' : 'webpack';
  }

  // Unlikely but at this point, we just assume webpack for older behavior
  return 'webpack';
}
