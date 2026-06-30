// Like otelEsmImportHookTemplate.js, but also registers the diagnostics-channel
// injection so that `node --import @sentry/node/import app.js` injects the
// channels unconditionally (they are only *subscribed* to when the app opts in
// via `experimentalUseDiagnosticsChannelInjection()`).
import '@sentry/server-utils/orchestrion/import-hook';
import { register } from 'module';

register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

globalThis._sentryEsmLoaderHookRegistered = true;
