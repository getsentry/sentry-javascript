import * as Sentry from '@sentry/nextjs';
import type { Log } from '@sentry/nextjs';

const enableSpanStreaming = process.env.NEXT_PUBLIC_E2E_NEXTJS_SPAN_STREAMING === '1';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1.0,
  sendDefaultPii: true,
  integrations: [
    Sentry.thirdPartyErrorFilterIntegration({
      filterKeys: ['nextjs-16-e2e'],
      behaviour: 'apply-tag-if-contains-third-party-frames',
    }),
    ...(enableSpanStreaming ? [Sentry.spanStreamingIntegration()] : []),
  ],
  // Verify Log type is available
  beforeSendLog(log: Log) {
    return log;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
