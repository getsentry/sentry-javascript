import * as Sentry from '@sentry/nextjs';
import type { Log } from '@sentry/nextjs';

// SENTRY_LIGHTHOUSE_MODE values:
//   ''/undefined   - existing E2E behavior (no tracing/replay; third-party-error-filter on)
//   'no-sentry'    - Sentry.init() is skipped entirely (SDK is still in the bundle because
//                    Next.js doesn't reliably treeshake @sentry/nextjs; see plan Risk 5)
//   'init-only'    - Sentry.init() with no integrations (measures SDK-core overhead)
//   'tracing-replay' - Sentry.init() with browserTracing + replay (measures feature overhead)
const lighthouseMode = process.env.NEXT_PUBLIC_SENTRY_LIGHTHOUSE_MODE;

if (lighthouseMode !== 'no-sentry') {
  Sentry.init({
    environment: 'qa', // dynamic sampling bias to keep transactions
    dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
    tunnel: `http://localhost:3031/`, // proxy server
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: lighthouseMode === 'tracing-replay' ? 1.0 : 0,
    replaysOnErrorSampleRate: lighthouseMode === 'tracing-replay' ? 1.0 : 0,
    sendDefaultPii: true,
    // Existing E2E behavior (mode unset/'') keeps third-party-error-filter on.
    // init-only / tracing-replay drop it so we measure SDK overhead without app-specific noise.
    // tracing-replay additionally enables browserTracing + replay.
    integrations: [
      ...(lighthouseMode === undefined || lighthouseMode === ''
        ? [
            Sentry.thirdPartyErrorFilterIntegration({
              filterKeys: ['nextjs-16-e2e'],
              behaviour: 'apply-tag-if-contains-third-party-frames',
            }),
          ]
        : []),
      ...(lighthouseMode === 'tracing-replay' ? [Sentry.browserTracingIntegration(), Sentry.replayIntegration()] : []),
    ],
    // Verify Log type is available
    beforeSendLog(log: Log) {
      return log;
    },
  });
}

export const onRouterTransitionStart = lighthouseMode !== 'no-sentry' ? Sentry.captureRouterTransitionStart : undefined;
