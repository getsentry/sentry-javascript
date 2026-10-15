import * as Sentry from '@sentry/react-router';
import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  // todo: get this from env
  dsn: __E2E_TEST_TUNNEL__ ? 'http://public@localhost:3031/1337' : 'https://username@domain/123',
  tunnel: __E2E_TEST_TUNNEL__ ? true : `http://localhost:3031/`, // proxy server
  integrations: [Sentry.reactRouterTracingIntegration()],
  tracesSampleRate: 1.0,
  tracePropagationTargets: [/^\//],
});

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter onError={Sentry.sentryOnError} />
    </StrictMode>,
  );
});
