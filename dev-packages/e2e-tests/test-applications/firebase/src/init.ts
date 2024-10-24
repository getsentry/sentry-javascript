import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

// Optional and only needed to see the internal diagnostic logging (during development)
// import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';
// diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

// Sentry.init({
//   environment: 'qa', // dynamic sampling bias to keep transactions
//   dsn: process.env.E2E_TEST_DSN,
//   includeLocalVariables: true,
//   debug: !!process.env.DEBUG,
//   tunnel: `http://localhost:3031/`, // proxy server
//   tracesSampleRate: 1,
//   // integrations: [Sentry.firebaseIntegration()],
//   // defaultIntegrations: false,
// });


Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  // dsn: 'https://3b6c388182fb435097f41d181be2b2ba@o4504321058471936.ingest.sentry.io/4504321066008576',
  // dsn: "https://800cb884b8566dc61c782f203db4eedf@o4507884032950272.ingest.de.sentry.io/4507884037537872",
  release: '1.0',
  tracesSampleRate: 1.0,
  // transport: loggingTransport,
  integrations: [Sentry.firebaseIntegration()],
  defaultIntegrations: false,
  tunnel: `http://localhost:3031/`, // proxy server
});
