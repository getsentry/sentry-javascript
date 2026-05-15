import { debug } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

declare global {
  // eslint-disable-next-line no-var
  var __SENTRY_ORCHESTRION__: { runtime?: boolean; bundler?: boolean } | undefined;
}

/**
 * Verifies that exactly one of the two orchestrion setup paths is active:
 * - the runtime hook (`node --import @sentry/node/orchestrion app.js`), OR
 * - the bundler plugin (`sentryOrchestrionPlugin()`).
 *
 * Warns if neither (channels never fire — integrations silently record nothing)
 * or both (double-wrapped — duplicate spans) ran.
 */
export function detectOrchestrionSetup(): void {
  const marker = globalThis.__SENTRY_ORCHESTRION__;
  const runtime = !!marker?.runtime;
  const bundler = !!marker?.bundler;

  DEBUG_BUILD && debug.log(`[orchestrion] detect: runtime=${runtime} bundler=${bundler}`);

  if (runtime && bundler) {
    DEBUG_BUILD &&
      debug.warn(
        '[Sentry] Detected BOTH the @sentry/node/orchestrion runtime hook AND the bundler plugin. ' +
          'Functions will be instrumented twice and produce duplicate spans. ' +
          'Remove `--import @sentry/node/orchestrion` if you are using the bundler plugin, or vice versa.',
      );
    return;
  }

  if (!runtime && !bundler) {
    DEBUG_BUILD &&
      debug.warn(
        '[Sentry] No orchestrion auto-instrumentation hook detected. Channel-based integrations ' +
          '(mysql, …) will not record spans. Either run with ' +
          '`node --import @sentry/node/orchestrion app.js`, or add `sentryOrchestrionPlugin()` ' +
          'to your bundler config.',
      );
  }
}
