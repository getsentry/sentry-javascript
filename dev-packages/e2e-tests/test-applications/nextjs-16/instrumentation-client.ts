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
  const integrations: Sentry.Integration[] = [];

  // Existing E2E behavior (unset) keeps third-party-error-filter on. We disable it in
  // init-only and tracing-replay so those modes measure SDK overhead without app-specific
  // integrations skewing the result.
  if (lighthouseMode === undefined || lighthouseMode === '') {
    integrations.push(
      Sentry.thirdPartyErrorFilterIntegration({
        filterKeys: ['nextjs-16-e2e'],
        behaviour: 'apply-tag-if-contains-third-party-frames',
      }),
    );
  }

  // tracing-replay mode enables both performance + session replay so we can measure their
  // combined overhead. init-only skips both.
  if (lighthouseMode === 'tracing-replay') {
    integrations.push(Sentry.browserTracingIntegration(), Sentry.replayIntegration());
  }

  Sentry.init({
    environment: 'qa', // dynamic sampling bias to keep transactions
    dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
    tunnel: `http://localhost:3031/`, // proxy server
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: lighthouseMode === 'tracing-replay' ? 1.0 : 0,
    replaysOnErrorSampleRate: lighthouseMode === 'tracing-replay' ? 1.0 : 0,
    sendDefaultPii: true,
    integrations,
    // Verify Log type is available
    beforeSendLog(log: Log) {
      return log;
    },
  });
}

export const onRouterTransitionStart = lighthouseMode !== 'no-sentry' ? Sentry.captureRouterTransitionStart : undefined;
