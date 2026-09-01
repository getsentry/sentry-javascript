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
  _sentryWrappedDepth?: number;
  /**
   * Bundler and runtime instrumentation detection.
   */
  __SENTRY_ORCHESTRION__?: {
    /** Empty array signifies runtime hooked */
    runtime?: string[];
    /**
     * Module names recorded as each bundler-transformed module loads (the
     * injected snippet calls `orchestrionModuleInjected`). The bundler plugin's
     * entry banner ensures an empty `Set` at boot, so a defined set — even
     * empty — signifies the plugin ran.
     */
    bundler?: Set<string>;
    /**
     * Channel-subscriber integration factories stored by the snippet the
     * bundler transform splices into each instrumented module, keyed by module
     * name. A factory shared by several packages (e.g. pg/pg-pool) appears
     * under several keys; integration-name deduplication collapses them at
     * setup. A bundler-only SDK (e.g. `@sentry/cloudflare`) reads these at
     * `init()` and instantiates them.
     */
    integrations?: Map<string, () => Integration>;
    /**
     * Set once `registerDiagnosticsChannelInjection()` has run but could not
     * install the runtime module hooks — the Node runtime lacks the required
     * module-hook API, or registration threw. Dedupes the one-time warning and
     * short-circuits repeat calls.
     */
    runtimeUnavailable?: boolean;
  };
} & Carrier;

/** Get's the global object for the current JavaScript runtime */
export const GLOBAL_OBJ = globalThis as unknown as InternalGlobal;
