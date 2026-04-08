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

// Get the client instrumentation from the Sentry integration
// NOTE: As of React Router 7.x, HydratedRouter does NOT invoke these hooks in Framework Mode.
// The client-side instrumentation is prepared for when React Router adds support.
// Client-side navigation is currently handled by the legacy instrumentHydratedRouter() approach.
const sentryClientInstrumentation = [tracing.clientInstrumentation];

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      {/* unstable_instrumentations is React Router 7.x's prop name (will become `instrumentations` in v8) */}
      <HydratedRouter unstable_instrumentations={sentryClientInstrumentation} />
    </StrictMode>,
  );
});
