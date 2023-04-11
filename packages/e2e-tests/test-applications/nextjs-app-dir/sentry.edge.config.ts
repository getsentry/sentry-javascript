import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: `http://localhost:${
    Number(process.env.BASE_PORT ?? 5698) + Number(process.env.PORT_MODULO ?? 0) + Number(process.env.PORT_GAP ?? 0)
  }/`, // proxy server
  tracesSampleRate: 1.0,
});
