import * as Sentry from '@sentry/react-router';
import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  // todo: get this from env
  dsn: 'https://username@domain/123',
  integrations: [Sentry.reactRouterTracingIntegration()],
  tracesSampleRate: 1.0,
  tunnel: `http://localhost:3031/`, // proxy server
  tracePropagationTargets: [/^\//],
});

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
