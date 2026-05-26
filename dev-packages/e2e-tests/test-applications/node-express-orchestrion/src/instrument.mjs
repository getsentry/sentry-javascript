import '@sentry/node/orchestrion';
import * as Sentry from '@sentry/node';

const client = Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
  _experimentalUseOrchestrion: true,
});

Sentry._experimentalSetupOrchestrion(client);
