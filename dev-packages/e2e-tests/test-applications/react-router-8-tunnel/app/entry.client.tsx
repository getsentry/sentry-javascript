import * as Sentry from '@sentry/react-router';
import { startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';

Sentry.init({
  dsn: 'http://public@localhost:3031/1337',
  // The SDK serves it under the app's `basename`.
  tunnel: true,
  integrations: [Sentry.reactRouterTracingIntegration()],
  tracesSampleRate: 1,
});

startTransition(() => {
  hydrateRoot(document, <HydratedRouter onError={Sentry.sentryOnError} />);
});
