// Loaded via `--import` BEFORE the scenario module, so the channel-injection
// hooks are installed before `@nestjs/*` is imported. Opting in via
// `experimentalUseDiagnosticsChannelInjection()` (before `init`) is all
// that's needed.

import { register } from 'node:module';
import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

// The scenario is TypeScript (NestJS needs decorators + design-type metadata).
// Opting into orchestrion installs an ESM loader hook (Node's `Module.register`
// path), which routes the `.ts` entry through the ESM chain — where the runner's
// CJS `-r ts-node/register` doesn't apply. Register `ts-node/esm` so the ESM
// chain can transpile the scenario; it composes with the orchestrion hook (which
// only transforms `@nestjs/*`).
register('ts-node/esm', import.meta.url);

// opt into the orchestrion implementation
Sentry.experimentalUseDiagnosticsChannelInjection();

// Because we opted in, `Sentry.init()` swaps the OTel `Nest` instrumentation
// for the diagnostics-channel one and synchronously installs the module hooks.
Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});
