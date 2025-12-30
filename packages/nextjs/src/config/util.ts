import { parseSemver } from '@sentry/core';
import * as fs from 'fs';
import { createRequire } from 'module';

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
    return createRequire(`${process.cwd()}/`).resolve('next/package.json');
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
 * Checks if the given Next.js version requires the `experimental.instrumentationHook` option.
 * Next.js 15.0.0 and higher (including certain RC and canary versions) no longer require this option
 * and will print a warning if it is set.
 *
 * @param version - version string to check.
 * @returns true if the version requires the instrumentationHook option to be set
 */
export function requiresInstrumentationHook(version: string): boolean {
  if (!version) {
    return true; // Default to requiring it if version cannot be determined
  }

  const { major, minor, patch, prerelease } = parseSemver(version);

  if (major === undefined || minor === undefined || patch === undefined) {
    return true; // Default to requiring it if parsing fails
  }

  // Next.js 16+ never requires the hook
  if (major >= 16) {
    return false;
  }

  // Next.js 14 and below always require the hook
  if (major < 15) {
    return true;
  }

  // At this point, we know it's Next.js 15.x.y
  // Stable releases (15.0.0+) don't require the hook
  if (!prerelease) {
    return false;
  }

  // Next.js 15.x.y with x > 0 or y > 0 don't require the hook
  if (minor > 0 || patch > 0) {
    return false;
  }

  // Check specific prerelease versions that don't require the hook
  if (prerelease.startsWith('rc.')) {
    const rcNumber = parseInt(prerelease.split('.')[1] || '0', 10);
    return rcNumber === 0; // Only rc.0 requires the hook
  }

  if (prerelease.startsWith('canary.')) {
    const canaryNumber = parseInt(prerelease.split('.')[1] || '0', 10);
    return canaryNumber < 124; // canary.124+ doesn't require the hook
  }

  // All other 15.0.0 prerelease versions (alpha, beta, etc.) require the hook
  return true;
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
