import * as Sentry from '@sentry/react-router';
import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';

// Create the tracing integration with useInstrumentationAPI enabled
// This must be set BEFORE Sentry.init() to prepare the instrumentation
const tracing = Sentry.reactRouterTracingIntegration({ useInstrumentationAPI: true });

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: 'https://username@domain/123',
  tunnel: `http://localhost:3031/`, // proxy server
  integrations: [tracing],
  tracesSampleRate: 1.0,
  tracePropagationTargets: [/^\//],
});

// Get the client instrumentation from the Sentry integration.
// As of React Router 7.15+, HydratedRouter invokes the client instrumentation hooks (`navigate`
// and `fetch`) in Framework Mode, so navigation and fetcher spans are created via the
// instrumentation API (origin `auto.*.react_router.instrumentation_api`). The legacy
// instrumentHydratedRouter() subscribe still runs to parameterize navigation span names.
const sentryClientInstrumentation = [tracing.clientInstrumentation];

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter instrumentations={sentryClientInstrumentation} onError={Sentry.sentryOnError} />
    </StrictMode>,
  );
});
