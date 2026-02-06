// Register ESM hooks before importing any other modules.
// This is required on Node 20.19+ and 22.12+ for OTEL module patching to work.
// Without this, middleware function names won't be captured.
import '@sentry/react-router/loader';

import * as Sentry from '@sentry/react-router';

// Initialize Sentry early (before the server starts)
// The server instrumentations are created in entry.server.tsx
Sentry.init({
  dsn: 'https://username@domain/123',
  environment: 'qa', // dynamic sampling bias to keep transactions
  tracesSampleRate: 1.0,
  tunnel: `http://localhost:3031/`, // proxy server
});
