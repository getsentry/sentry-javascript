import React from 'react';
import ReactDOM from 'react-dom/client';
import Index from './pages/Index';

const lighthouseMode = process.env.REACT_APP_SENTRY_LIGHTHOUSE_MODE;

if (lighthouseMode === 'no-sentry') {
  // No Sentry at all — sync render so webpack/CRA can fully dead-code-eliminate the
  // @sentry/react import below. CRA inlines `process.env.REACT_APP_*` at build time,
  // so this branch becomes the only one in the bundle when the env var is set.
  const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
  root.render(
    <div>
      <Index />
    </div>,
  );
} else {
  // Dynamic-import Sentry so it lives in a separate chunk that webpack/CRA drops
  // entirely from the no-sentry build above. Preserves existing E2E behavior when
  // the env var is unset (init + error handlers, no tracing/replay).
  void (async () => {
    const Sentry = await import('@sentry/react');

    const integrations: unknown[] = [];
    if (lighthouseMode === 'tracing-replay') {
      integrations.push(Sentry.browserTracingIntegration());
      integrations.push(Sentry.replayIntegration());
    }

    Sentry.init({
      environment: 'qa', // dynamic sampling bias to keep transactions
      dsn: process.env.REACT_APP_E2E_TEST_DSN,
      release: 'e2e-test',
      tunnel: 'http://localhost:3031/', // proxy server
      integrations: integrations as Parameters<typeof Sentry.init>[0]['integrations'],
      tracesSampleRate: lighthouseMode === 'tracing-replay' ? 1.0 : undefined,
      replaysSessionSampleRate: lighthouseMode === 'tracing-replay' ? 1.0 : 0,
      replaysOnErrorSampleRate: lighthouseMode === 'tracing-replay' ? 1.0 : 0,
    });

    const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement, {
      onUncaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
        // oxlint-disable-next-line no-console
        console.warn(error, errorInfo);
      }),
      onCaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
        // oxlint-disable-next-line no-console
        console.warn(error, errorInfo);
      }),
    });

    root.render(
      <div>
        <Index />
      </div>,
    );
  })();
}
