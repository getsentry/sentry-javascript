import * as Sentry from '@sentry/nextjs';
import type { Log } from '@sentry/nextjs';

const lighthouseMode = process.env.NEXT_PUBLIC_SENTRY_LIGHTHOUSE_MODE;

if (lighthouseMode !== 'no-sentry') {
  const integrations: Sentry.Integration[] = [];

  if (lighthouseMode !== 'init-only') {
    integrations.push(
      Sentry.thirdPartyErrorFilterIntegration({
        filterKeys: ['nextjs-16-e2e'],
        behaviour: 'apply-tag-if-contains-third-party-frames',
      }),
    );
  }

  Sentry.init({
    environment: 'qa', // dynamic sampling bias to keep transactions
    dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
    tunnel: `http://localhost:3031/`, // proxy server
    tracesSampleRate: 1.0,
    sendDefaultPii: true,
    integrations,
    // Verify Log type is available
    beforeSendLog(log: Log) {
      return log;
    },
  });
}

export const onRouterTransitionStart = lighthouseMode !== 'no-sentry' ? Sentry.captureRouterTransitionStart : undefined;
