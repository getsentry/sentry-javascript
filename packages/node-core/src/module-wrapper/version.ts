/**
 * Utilities for extracting package version information.
 *
 * This provides a helper to read the version from a package's package.json
 * given its base directory (as provided by require-in-the-middle hooks).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { debug } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

/**
 * Extract the version from a package's package.json.
 *
 * @param basedir - The base directory of the package (from RITM/IITM hooks)
 * @returns The package version, or undefined if not found
 */
export function extractPackageVersion(basedir: string | undefined): string | undefined {
  if (!basedir) {
    return undefined;
  }

  try {
    const packageJsonPath = path.join(basedir, 'package.json');
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent) as { version?: string };
    return packageJson.version;
  } catch (e) {
    DEBUG_BUILD && debug.warn(`Failed to extract package version from ${basedir}:`, e);
    return undefined;
  }
}
