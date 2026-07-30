import * as Sentry from '@sentry/react-router';

// Imported at the top of `entry.server.tsx` so it's bundled into the server build. Orchestrion injects
// its `diagnostics_channel` publishers into that same bundle, so the channel subscribers must be
// registered from within it too — a `--import` hook outside the bundle wouldn't see the inlined modules.
// The server instrumentations are created in entry.server.tsx.
Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://username@domain/123',
  environment: 'qa', // dynamic sampling bias to keep transactions
  tracesSampleRate: 1.0,
  tunnel: `http://localhost:3031/`, // proxy server
});
