import { bunHttpServerIntegration, fetchIntegration as bunFetchIntegration } from '@sentry/bun';
import { fetchIntegration as denoFetchIntegration } from '@sentry/deno';
import * as Sentry from '@sentry/nuxt';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  tunnel: 'http://localhost:3031/', // proxy server
  enableLogs: true,
  // Opt into the Sentry OpenTelemetry tracer provider in the "(tracer provider)" e2e variant.
  // Leaving it `undefined` otherwise keeps the SDK's default (no provider).
  enableOpenTelemetrySetup: process.env.E2E_TEST_OTEL_SETUP === 'true' ? true : undefined,
  integrations: integrations => [
    // Several tests trigger the same server error one after another, which Dedupe would drop.
    ...integrations.filter(integration => integration.name !== 'Dedupe'),
    // Bun does not emit the `node:http` diagnostics channel the Node SDK uses for incoming requests, so it would
    // create no `http.server` spans. The `fetch` of Bun and Deno is not undici, so the Node SDK does not see
    // outgoing requests.
    ...(process.versions.bun ? [bunHttpServerIntegration(), bunFetchIntegration()] : []),
    ...(process.versions.deno ? [denoFetchIntegration()] : []),
  ],
});
