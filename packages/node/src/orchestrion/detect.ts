import { debug } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

declare global {
  // eslint-disable-next-line no-var
  var __SENTRY_ORCHESTRION__: { runtime?: boolean; bundler?: boolean } | undefined;
}

/**
 * Verifies that orchestrion has been setup, either:
 * - the runtime hook (`node --import @sentry/node/orchestrion app.js`), OR
 * - the bundler plugin (`sentryOrchestrionPlugin()`)
 */
export function detectOrchestrionSetup(): void {
  if (!DEBUG_BUILD) return;

  const marker = globalThis.__SENTRY_ORCHESTRION__;
  const runtime = !!marker?.runtime;
  const bundler = !!marker?.bundler;

  debug.log(`[orchestrion] detect: runtime=${runtime} bundler=${bundler}`);

  if (!runtime && !bundler) {
    debug.warn(
      '[Sentry] No orchestrion auto-instrumentation hook detected. Channel-based integrations ' +
        '(mysql, …) will not record spans. Either run with ' +
        '`node --import @sentry/node/orchestrion app.js`, or add `sentryOrchestrionPlugin()` ' +
        'to your bundler config.',
    );
  }
}
