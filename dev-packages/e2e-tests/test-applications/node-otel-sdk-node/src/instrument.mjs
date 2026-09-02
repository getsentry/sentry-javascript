import { register } from 'node:module';

// The app runs as ESM, so the OpenTelemetry instrumentation needs import-in-the-middle to see the
// modules it patches. Registering the hook before anything else is imported also puts it next to
// Sentry's own orchestrion module hook, which the SDK installs from `Sentry.init()`.
register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

await import('./telemetry.mjs');
