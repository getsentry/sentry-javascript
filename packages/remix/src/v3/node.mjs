// Replaces `--import remix/node-tsx` rather than adding a second flag.
//
// This has to happen here, not in `Sentry.init()`: the module hook must be in place before
// `@remix-run/fetch-router` is imported, and the subscription before `createRouter()` runs, which is
// while the app's own modules are still being imported.
import { registerDiagnosticsChannelInjection } from '@sentry/server-runtime-injection/register';

registerDiagnosticsChannelInjection();

// A failure to load the SDK must not stop the app: this runs before anything of the app has, and an
// uncaught error here means Remix never starts.
try {
  const { instrumentRemixV3 } = await import('@sentry/remix/v3');
  instrumentRemixV3();
} catch (error) {
  // oxlint-disable-next-line no-console
  console.warn('[Sentry] Could not load @sentry/remix/v3. The app starts without Sentry instrumentation.', error);
}

await import('remix/node-tsx');
