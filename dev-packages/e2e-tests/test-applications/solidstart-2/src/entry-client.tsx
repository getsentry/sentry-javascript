// @refresh reload
import * as Sentry from '@sentry/solidstart';
import { solidRouterBrowserTracingIntegration } from '@sentry/solidstart/solidrouter';
import { StartClient, mount } from '@solidjs/start/client';

declare const __E2E_TEST_TUNNEL__: boolean;

Sentry.init({
  // We can't use env variables here, seems like they are stripped
  // out in production builds.
  // The tunnel variant forwards to the test proxy, so the DSN has to point there.
  dsn: __E2E_TEST_TUNNEL__ ? 'http://public@localhost:3031/1337' : 'https://public@dsn.ingest.sentry.io/1337',
  environment: 'qa', // dynamic sampling bias to keep transactions
  integrations: [solidRouterBrowserTracingIntegration()],
  tunnel: __E2E_TEST_TUNNEL__ ? true : 'http://localhost:3031/', // proxy server
  // Performance Monitoring
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  debug: !!import.meta.env.DEBUG,
});

mount(() => <StartClient />, document.getElementById('app')!);
