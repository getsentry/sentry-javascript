/**
 * Module wrapper utilities for patching Node.js modules.
 *
 * This provides a Sentry-owned alternative to OTel's registerInstrumentations(),
 * allowing module patching without requiring the full OTel instrumentation infrastructure.
 */

import { Hook } from 'import-in-the-middle';
import { satisfies } from './semver';
import { RequireInTheMiddleSingleton, type OnRequireFn } from './singleton';
import { extractPackageVersion } from './version';
import { DEBUG_BUILD } from '../debug-build';
import { debug } from '@sentry/core';
export type { OnRequireFn };
export { satisfies } from './semver';
export { extractPackageVersion } from './version';

/** Store for module options, keyed by module name */
const MODULE_OPTIONS = new Map<string, unknown>();

/** Options for file-level patching within a module */
export interface ModuleWrapperFileOptions<TOptions = unknown> {
  /** Relative path within the package (e.g., 'lib/client.js') */
  name: string;
  /** Semver ranges for supported versions of the file */
  supportedVersions: string[];
  /** Function to patch the file's exports. Use getOptions() to access current options at runtime. */
  patch: (exports: unknown, getOptions: () => TOptions | undefined, version?: string) => unknown;
}

/** Options for registering a module wrapper */
export interface ModuleWrapperOptions<TOptions = unknown> {
  /** Module name to wrap (e.g., 'express', 'pg', '@prisma/client') */
  moduleName: string;
  /** Semver ranges for supported versions (e.g., ['>=4.0.0 <5.0.0']) */
  supportedVersions: string[];
  /** Function to patch the module's exports. Use getOptions() to access current options at runtime. */
  patch: (moduleExports: unknown, getOptions: () => TOptions | undefined, version?: string) => unknown;
  /** Optional array of specific files within the module to patch */
  files?: ModuleWrapperFileOptions<TOptions>[];
  /** Optional configuration options that can be updated on subsequent calls */
  options?: TOptions;
}

/**
 * Register a module wrapper to patch a module when it's required/imported.
 *
 * This sets up hooks for both CommonJS (via require-in-the-middle) and
 * ESM (via import-in-the-middle) module loading.
 *
 * Calling this multiple times for the same module is safe:
 * - The wrapping/hooking only happens once (first call)
 * - Options are always updated (subsequent calls replace options)
 * - Use `getOptions()` in your patch function to access current options at runtime
 *
 * @param wrapperOptions - Configuration for the module wrapper
 *
 * @example
 * ```ts
 * registerModuleWrapper({
 *   moduleName: 'express',
 *   supportedVersions: ['>=4.0.0 <6.0.0'],
 *   options: { customOption: true },
 *   patch: (moduleExports, getOptions, version) => {
 *     // getOptions() returns the current options at runtime
 *     patchExpressModule(moduleExports, getOptions);
 *     return moduleExports;
 *   },
 * });
 * ```
 */
export function registerModuleWrapper<TOptions = unknown>(wrapperOptions: ModuleWrapperOptions<TOptions>): void {
  const { moduleName, supportedVersions, patch, files, options } = wrapperOptions;

  // Always update the stored options (even if already registered)
  MODULE_OPTIONS.set(moduleName, options);

  // If already registered, skip the wrapping - options have been updated above
  if (MODULE_OPTIONS.has(moduleName) && options === undefined) {
    // This means we've registered before but this call has no new options
    // Still skip re-registration
    return;
  }

  // Create a getter that retrieves current options at runtime
  const getOptions = () => MODULE_OPTIONS.get(moduleName) as TOptions;

  // Create the onRequire handler for CJS
  const onRequire: OnRequireFn = (exports, name, basedir) => {
    // Check if this is the main module or a file within it
    const isMainModule = name === moduleName;

    if (isMainModule) {
      // Main module - check version and patch
      const version = extractPackageVersion(basedir);
      if (isVersionSupported(version, supportedVersions)) {
        DEBUG_BUILD &&
          debug.log(
            '[ModuleWrapper]',
            `registering module wrapper for ${moduleName} with version ${version}`,
            `supportedVersions: ${supportedVersions}`,
            `file hooks: ${files?.map(f => f.name).join(', ')}`,
          );

        return patch(exports, getOptions, version);
      }
    } else if (files) {
      // Check if this is one of the specified files
      for (const file of files) {
        const expectedPath = `${moduleName}/${file.name}`;
        if (name === expectedPath || name.endsWith(`/${expectedPath}`)) {
          const version = extractPackageVersion(basedir);
          if (isVersionSupported(version, file.supportedVersions)) {
            return file.patch(exports, getOptions, version);
          }
        }
      }
    }

    return exports;
  };

  // Register with CJS singleton (require-in-the-middle)
  const ritmSingleton = RequireInTheMiddleSingleton.getInstance();
  ritmSingleton.register(moduleName, onRequire);

  // Register file hooks with the singleton as well
  if (files) {
    for (const file of files) {
      const filePath = `${moduleName}/${file.name}`;
      ritmSingleton.register(filePath, onRequire);
    }
  }

  // Register with ESM (import-in-the-middle)
  // The ESM loader must be initialized before this (via initializeEsmLoader())
  const moduleNames = [moduleName];
  if (files) {
    for (const file of files) {
      moduleNames.push(`${moduleName}/${file.name}`);
    }
  }

  new Hook(moduleNames, { internals: true }, (exports, name, basedir) => {
    // Convert void to undefined for compatibility
    const baseDirectory = basedir || undefined;
    const isMainModule = name === moduleName;

    if (isMainModule) {
      const version = extractPackageVersion(baseDirectory);
      if (isVersionSupported(version, supportedVersions)) {
        DEBUG_BUILD &&
          debug.log(
            '[ModuleWrapper]',
            `registering ESM module wrapper for ${moduleName} with version ${version}`,
            `supportedVersions: ${supportedVersions}`,
            `file hooks: ${files?.map(f => f.name).join(', ')}`,
          );

        return patch(exports, getOptions, version);
      }
    } else if (files) {
      for (const file of files) {
        const expectedPath = `${moduleName}/${file.name}`;
        if (name === expectedPath || name.endsWith(`/${expectedPath}`)) {
          const version = extractPackageVersion(baseDirectory);
          if (isVersionSupported(version, file.supportedVersions)) {
            return file.patch(exports, getOptions, version);
          }
        }
      }
    }

    return exports;
  });
}

/**
 * Check if a version is supported by the given semver ranges.
 *
 * @param version - The version to check (or undefined if not available)
 * @param supportedVersions - Array of semver range strings
 * @returns true if the version is supported
 */
function isVersionSupported(version: string | undefined, supportedVersions: string[]): boolean {
  // If no version is available (e.g., core modules), we allow patching
  if (!version) {
    return true;
  }

  // Check if the version satisfies any of the supported ranges
  for (const range of supportedVersions) {
    if (satisfies(version, range)) {
      return true;
    }
  }

  return false;
}
