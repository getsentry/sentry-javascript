// @refresh reload
import * as Sentry from '@sentry/solidstart';
import { solidRouterBrowserTracingIntegration } from '@sentry/solidstart/solidrouter';
import { StartClient, mount } from '@solidjs/start/client';

Sentry.init({
  // We can't use env variables here, seems like they are stripped
  // out in production builds.
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  environment: 'qa', // dynamic sampling bias to keep transactions
  integrations: [solidRouterBrowserTracingIntegration()],
  tunnel: 'http://localhost:3031/', // proxy server
  // Performance Monitoring
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  debug: !!import.meta.env.DEBUG,
});

mount(() => <StartClient />, document.getElementById('app')!);
