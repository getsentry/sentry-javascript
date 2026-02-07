'use client';

import { useEffect } from 'react';

// RSC mode doesn't use entry.client.tsx, so we initialize Sentry via a client component.
export function SentryClient() {
  useEffect(() => {
    import('@sentry/react-router')
      .then(Sentry => {
        if (!Sentry.isInitialized()) {
          Sentry.init({
            environment: 'qa',
            dsn: 'https://username@domain/123',
            tunnel: `http://localhost:3031/`,
            integrations: [Sentry.reactRouterTracingIntegration()],
            tracesSampleRate: 1.0,
            tracePropagationTargets: [/^\//],
          });
        }
      })
      .catch(e => {
        // Silent fail in production, but log in dev for debugging
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[Sentry] Failed to initialize:', e);
        }
      });
  }, []);

  return null;
}
