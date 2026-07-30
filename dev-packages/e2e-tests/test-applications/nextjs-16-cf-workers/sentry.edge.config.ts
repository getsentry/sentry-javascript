import * as Sentry from '@sentry/nextjs';

Sentry.init({
  traceLifecycle: 'static',
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampler: samplingContext => {
    if (samplingContext.attributes?.['next.span_type'] === 'Middleware.execute') {
      // Only keep the middleware transaction when `normalizedRequest` was available at sampling time.
      // Test times out and fails when transaction is dropped
      const { normalizedRequest } = samplingContext;
      return Boolean(normalizedRequest?.url && normalizedRequest?.method);
    }

    return 1.0;
  },
  dataCollection: { userInfo: true },
  // debug: true,
});
