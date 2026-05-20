import * as Sentry from '@sentry/react';

export function initSentry(): void {
  Sentry.init({
    dsn: import.meta.env.VITE_E2E_TEST_DSN as string | undefined,
    release: 'lighthouse-fixture',
    environment: 'qa',
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 1.0,
    replaysOnErrorSampleRate: 1.0,
  });
}
