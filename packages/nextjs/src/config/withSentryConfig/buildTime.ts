import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { NextConfigObject, SentryBuildOptions } from '../types';

/**
 * Adds Sentry-related build-time variables to `nextConfig.env`.
 *
 * Note: this mutates `userNextConfig`.
 *
 * @param userNextConfig - The user's Next.js config object
 * @param userSentryOptions - The Sentry build options passed to `withSentryConfig`
 * @param releaseName - The resolved release name, if any
 */
export function setUpBuildTimeVariables(
  userNextConfig: NextConfigObject,
  userSentryOptions: SentryBuildOptions,
  releaseName: string | undefined,
): void {
  const assetPrefix = userNextConfig.assetPrefix || userNextConfig.basePath || '';
  const basePath = userNextConfig.basePath ?? '';

  const rewritesTunnelPath =
    userSentryOptions.tunnelRoute !== undefined &&
    userNextConfig.output !== 'export' &&
    typeof userSentryOptions.tunnelRoute === 'string'
      ? `${basePath}${userSentryOptions.tunnelRoute}`
      : undefined;

  const buildTimeVariables: Record<string, string> = {
    // Make sure that if we have a windows path, the backslashes are interpreted as such (rather than as escape
    // characters)
    _sentryRewriteFramesDistDir: userNextConfig.distDir?.replace(/\\/g, '\\\\') || '.next',
    // Get the path part of `assetPrefix`, minus any trailing slash. (We use a placeholder for the origin if
    // `assetPrefix` doesn't include one. Since we only care about the path, it doesn't matter what it is.)
    _sentryRewriteFramesAssetPrefixPath: assetPrefix
      ? new URL(assetPrefix, 'http://dogs.are.great').pathname.replace(/\/$/, '')
      : '',
  };

  if (userNextConfig.assetPrefix) {
    buildTimeVariables._assetsPrefix = userNextConfig.assetPrefix;
  }

  if (userSentryOptions._experimental?.thirdPartyOriginStackFrames) {
    buildTimeVariables._experimentalThirdPartyOriginStackFrames = 'true';
  }

  if (rewritesTunnelPath) {
    buildTimeVariables._sentryRewritesTunnelPath = rewritesTunnelPath;
  }

  if (basePath) {
    buildTimeVariables._sentryBasePath = basePath;
  }

  if (userNextConfig.assetPrefix) {
    buildTimeVariables._sentryAssetPrefix = userNextConfig.assetPrefix;
  }

  if (userSentryOptions._experimental?.thirdPartyOriginStackFrames) {
    buildTimeVariables._experimentalThirdPartyOriginStackFrames = 'true';
  }

  if (releaseName) {
    buildTimeVariables._sentryRelease = releaseName;
  }

  if (typeof userNextConfig.env === 'object') {
    userNextConfig.env = { ...buildTimeVariables, ...userNextConfig.env };
  } else if (userNextConfig.env === undefined) {
    userNextConfig.env = buildTimeVariables;
  }
}

/**
 * Returns the current git SHA (HEAD), if available.
 *
 * This is a best-effort helper and returns `undefined` if git isn't available or the cwd isn't a git repo.
 */
export function getGitRevision(): string | undefined {
  let gitRevision: string | undefined;
  try {
    gitRevision = childProcess
      .execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    // noop
  }
  return gitRevision;
}

/**
 * Reads the project's `instrumentation-client.(js|ts)` file contents, if present.
 *
 * @returns The file contents, or `undefined` if the file can't be found/read
 */
export function getInstrumentationClientFileContents(): string | void {
  const potentialInstrumentationClientFileLocations = [
    ['src', 'instrumentation-client.ts'],
    ['src', 'instrumentation-client.js'],
    ['instrumentation-client.ts'],
    ['instrumentation-client.js'],
  ];

  for (const pathSegments of potentialInstrumentationClientFileLocations) {
    try {
      return fs.readFileSync(path.join(process.cwd(), ...pathSegments), 'utf-8');
    } catch {
      // noop
    }
  }
}
