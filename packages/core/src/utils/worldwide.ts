/**
 * NOTE: In order to avoid circular dependencies, if you add a function to this module and it needs to print something,
 * you must either a) use `console.log` rather than the `debug` singleton, or b) put your function elsewhere.
 *
 * Note: This file was originally called `global.ts`, but was changed to unblock users which might be doing
 * string replaces with bundlers like Vite for `global` (would break imports that rely on importing from utils/src/global).
 *
 * Why worldwide?
 *
 * Why not?
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Integration } from '../types/integration';
import type { Carrier } from '../carrier';
import type { SdkSource } from './env';

/** Internal global with common properties and Sentry extensions  */
export type InternalGlobal = {
  navigator?: { userAgent?: string; maxTouchPoints?: number };
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
   * Native debug IDs implementation (e.g., from Vercel).
   * This uses the same format as _sentryDebugIds but with a different global name.
   * Keys are `error.stack` strings, values are debug IDs.
   */
  _debugIds?: Record<string, string>;
  /**
   * Raw module metadata that is injected by bundler plugins.
   *
   * Keys are `error.stack` strings, values are the metadata.
   */
  _sentryModuleMetadata?: Record<string, any>;
  _sentryEsmLoaderHookRegistered?: boolean;
  _sentryWrappedDepth?: number;
  /**
   * Orchestrion bundler and runtime detection.
   */
  __SENTRY_ORCHESTRION__?: {
    /** Empty array signifies runtime hooked */
    runtime?: string[];
    /** Empty array signifies bundler plugin ran */
    bundler?: string[];
    /**
     * Channel-subscriber integration factories a bundler plugin's
     * subscribe-injection stored here, keyed by export name (one per instrumented
     * package actually bundled; the key dedupes packages split across several
     * files). A bundler-only SDK (e.g. `@sentry/cloudflare`) reads these at
     * `init()` and instantiates them.
     */
    integrations?: Map<string, () => Integration>;
    /**
     * Bridge installed at `init()` by `registerDiagnosticsChannelInjection`.
     * The bundler's `injectDiagnostics` boot banner calls it for each
     * transformed module, emitting the `orchestrion.module-runtime-injected`
     * client event so channel integrations subscribe for force-bundled modules
     * (which the runtime module hook never sees). Absent on bundler-only
     * runtimes (e.g. `@sentry/cloudflare`), where the banner's call is a
     * guarded no-op.
     */
    onInject?: (moduleName: string) => void;
  };
} & Carrier;

/** Get's the global object for the current JavaScript runtime */
export const GLOBAL_OBJ = globalThis as unknown as InternalGlobal;
