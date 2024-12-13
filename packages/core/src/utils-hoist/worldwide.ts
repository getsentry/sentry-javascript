/**
 * NOTE: In order to avoid circular dependencies, if you add a function to this module and it needs to print something,
 * you must either a) use `console.log` rather than the logger, or b) put your function elsewhere.
 *
 * Note: This file was originally called `global.ts`, but was changed to unblock users which might be doing
 * string replaces with bundlers like Vite for `global` (would break imports that rely on importing from utils/src/global).
 *
 * Why worldwide?
 *
 * Why not?
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Client, MetricsAggregator, Scope } from '../types-hoist';

import type { SdkSource } from './env';
import type { logger } from './logger';
import { SDK_VERSION } from './version';

interface SentryCarrier {
  acs?: any;
  stack?: any;

  globalScope?: Scope;
  defaultIsolationScope?: Scope;
  defaultCurrentScope?: Scope;
  globalMetricsAggregators?: WeakMap<Client, MetricsAggregator> | undefined;
  logger?: typeof logger;

  /** Overwrites TextEncoder used in `@sentry/core`, need for `react-native@0.73` and older */
  encodePolyfill?: (input: string) => Uint8Array;
  /** Overwrites TextDecoder used in `@sentry/core`, need for `react-native@0.73` and older */
  decodePolyfill?: (input: Uint8Array) => string;
}

/** Internal global with common properties and Sentry extensions  */
export type InternalGlobal = {
  navigator?: { userAgent?: string };
  console: Console;
  PerformanceObserver?: any;
  Sentry?: any;
  onerror?: {
    (event: object | string, source?: string, lineno?: number, colno?: number, error?: Error): any;
    __SENTRY_INSTRUMENTED__?: true;
  };
  onunhandledrejection?: {
    (event: unknown): boolean;
    __SENTRY_INSTRUMENTED__?: true;
  };
  SENTRY_ENVIRONMENT?: string;
  SENTRY_DSN?: string;
  SENTRY_RELEASE?: {
    id?: string;
  };
  SENTRY_SDK_SOURCE?: SdkSource;
  /**
   * Debug IDs are indirectly injected by Sentry CLI or bundler plugins to directly reference a particular source map
   * for resolving of a source file. The injected code will place an entry into the record for each loaded bundle/JS
   * file.
   */
  _sentryDebugIds?: Record<string, string>;
  __SENTRY__: Record<Exclude<string, 'version'>, SentryCarrier> & {
    version?: string;
  };
  /**
   * Raw module metadata that is injected by bundler plugins.
   *
   * Keys are `error.stack` strings, values are the metadata.
   */
  _sentryModuleMetadata?: Record<string, any>;
  _sentryEsmLoaderHookRegistered?: boolean;
};

/** Get's the global object for the current JavaScript runtime */
export const GLOBAL_OBJ = globalThis as unknown as InternalGlobal;

/**
 * Returns a global singleton contained in the global `__SENTRY__[]` object.
 *
 * If the singleton doesn't already exist in `__SENTRY__`, it will be created using the given factory
 * function and added to the `__SENTRY__` object.
 *
 * @param name name of the global singleton on __SENTRY__
 * @param creator creator Factory function to create the singleton if it doesn't already exist on `__SENTRY__`
 * @param obj (Optional) The global object on which to look for `__SENTRY__`, if not `GLOBAL_OBJ`'s return value
 * @returns the singleton
 */
export function getGlobalSingleton<T>(name: keyof SentryCarrier, creator: () => T, obj = GLOBAL_OBJ): T {
  const __SENTRY__ = getSentryCarrierObj(obj);
  const versionedCarrier = (__SENTRY__[SDK_VERSION] = __SENTRY__[SDK_VERSION] || {});
  return versionedCarrier[name] || (versionedCarrier[name] = creator());
}

function getSentryCarrierObj(
  obj: Omit<InternalGlobal, '__SENTRY__'> & Partial<Pick<InternalGlobal, '__SENTRY__'>>,
): InternalGlobal['__SENTRY__'] {
  // Set the Sentry carrier, if it does not exist yet
  return obj.__SENTRY__ || (obj.__SENTRY__ = {});
}
