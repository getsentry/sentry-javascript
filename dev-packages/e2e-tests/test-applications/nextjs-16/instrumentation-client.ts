import * as Sentry from '@sentry/nextjs';
import type { Log } from '@sentry/nextjs';

// Replay and feedback only run in the feedback variant, so they don't add envelopes to every other test.
const feedbackEnabled = process.env.NEXT_PUBLIC_E2E_FEEDBACK === '1';

Sentry.init({
  traceLifecycle: process.env.NEXT_PUBLIC_E2E_TEST_TRACE_LIFECYCLE === 'static' ? 'static' : undefined,
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1.0,
  _flushInterval: 100,
  integrations: [
    Sentry.thirdPartyErrorFilterIntegration({
      filterKeys: ['nextjs-16-e2e'],
      behaviour:
        process.env.NEXT_PUBLIC_EXCLUDE_APPLICATION_KEY_DEPENDENCIES === '1'
          ? 'apply-tag-if-exclusively-contains-third-party-frames'
          : 'apply-tag-if-contains-third-party-frames',
    }),
    ...(feedbackEnabled
      ? [Sentry.replayIntegration(), Sentry.feedbackIntegration({ colorScheme: 'system', autoInject: false })]
      : []),
  ],
  ...(feedbackEnabled ? { replaysSessionSampleRate: 1.0, replaysOnErrorSampleRate: 1.0 } : {}),
  // Verify Log type is available
  beforeSendLog(log: Log) {
    return log;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
