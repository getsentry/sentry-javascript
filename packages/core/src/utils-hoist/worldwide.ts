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

import type { Carrier } from '../carrier';
import type { SdkSource } from './env';

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
  /**
   * Raw module metadata that is injected by bundler plugins.
   *
   * Keys are `error.stack` strings, values are the metadata.
   */
  _sentryModuleMetadata?: Record<string, any>;
  _sentryEsmLoaderHookRegistered?: boolean;
} & Carrier;

/** Get's the global object for the current JavaScript runtime */
export const GLOBAL_OBJ = globalThis as unknown as InternalGlobal;
