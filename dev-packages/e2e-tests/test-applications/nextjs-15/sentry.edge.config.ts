import * as Sentry from '@sentry/nextjs';

Sentry.init({
  traceLifecycle: 'static',
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampler: samplingContext => {
    if (samplingContext.attributes?.['next.span_type'] === 'Middleware.execute') {
      // Only keep the middleware transaction when `normalizedRequest` was available at sampling time and belongs to
      // the request that is being sampled (guards against concurrent requests leaking into each other's sampling
      // context). The middleware e2e tests time out and fail when the transaction is dropped here.
      const { normalizedRequest } = samplingContext;
      return Boolean(
        normalizedRequest?.method &&
        normalizedRequest?.url &&
        normalizedRequest.url === samplingContext.attributes['http.target'],
      );
    }

    return 1.0;
  },
  transportOptions: {
    // We are doing a lot of events at once in this test
    bufferSize: 1000,
  },
});
