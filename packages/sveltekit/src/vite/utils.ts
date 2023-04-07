import * as fs from 'fs';
import * as path from 'path';

/**
 * Checks if the user has a Sentry init file in the root of their project.
 * @returns true if the user has a Sentry init file, false otherwise.
 */
export function hasSentryInitFiles(): boolean {
  const hasSentryServerInit = !!getUserConfigFile(process.cwd(), 'server');
  const hasSentryClientInit = !!getUserConfigFile(process.cwd(), 'client');
  return hasSentryServerInit || hasSentryClientInit;
}

/**
 * Looks up the sentry.{@param platform}.config.(ts|js) file
 * @returns the file path to the file or undefined if it doesn't exist
 */
export function getUserConfigFile(projectDir: string, platform: 'server' | 'client'): string | undefined {
  const possibilities = [`sentry.${platform}.config.ts`, `sentry.${platform}.config.js`];

  for (const filename of possibilities) {
    if (fs.existsSync(path.resolve(projectDir, filename))) {
      return filename;
    }
  }

  return undefined;
}
