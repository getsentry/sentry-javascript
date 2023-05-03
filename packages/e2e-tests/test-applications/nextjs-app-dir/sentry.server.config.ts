import * as Sentry from '@sentry/nextjs';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: `http://localhost:${
    Number(process.env.NEXT_PUBLIC_BASE_PORT) +
    Number(process.env.NEXT_PUBLIC_PORT_MODULO) +
    Number(process.env.NEXT_PUBLIC_PORT_GAP)
  }/`, // proxy server
  tracesSampleRate: 1.0,
});
