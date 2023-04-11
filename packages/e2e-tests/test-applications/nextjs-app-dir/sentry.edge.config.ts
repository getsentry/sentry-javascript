import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: `http://localhost:${
    Number(process.env.NEXT_PUBLIC_BASE_PORT ?? 5698) +
    Number(process.env.NEXT_PUBLIC_PORT_MODULO ?? 0) +
    Number(process.env.NEXT_PUBLIC_PORT_GAP ?? 0)
  }/`, // proxy server
  tracesSampleRate: 1.0,
});
