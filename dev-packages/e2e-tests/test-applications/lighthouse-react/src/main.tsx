import * as Sentry from '@sentry/react';
import { createRoot } from 'react-dom/client';
import App from './App';

if (import.meta.env.MODE === 'tracing-replay') {
  Sentry.init({
    dsn: import.meta.env.VITE_E2E_TEST_DSN as string | undefined,
    release: 'lighthouse-fixture',
    environment: 'qa',
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 1.0,
    replaysOnErrorSampleRate: 1.0,
  });
} else if (import.meta.env.MODE === 'tracing') {
  // Tracing + errors, but no replay — isolates the replay integration's cost.
  Sentry.init({
    dsn: import.meta.env.VITE_E2E_TEST_DSN as string | undefined,
    release: 'lighthouse-fixture',
    environment: 'qa',
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 1.0,
  });
} else if (import.meta.env.MODE === 'errors-only') {
  // Default integrations only — errors are always captured, no tracing or replay.
  Sentry.init({
    dsn: import.meta.env.VITE_E2E_TEST_DSN as string | undefined,
    release: 'lighthouse-fixture',
    environment: 'qa',
  });
} else if (import.meta.env.MODE === 'init-only') {
  // enabled: false makes the SDK a guaranteed no-op (no transport allocation,
  // no DSN warning). We're measuring pure SDK-loading + tree-shaking cost.
  Sentry.init({ enabled: false });
}
// 'no-sentry' mode: all branches above are statically dead, so Vite drops
// the @sentry/react import entirely from the bundle.

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
