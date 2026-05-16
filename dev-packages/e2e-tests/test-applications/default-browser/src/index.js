const lighthouseMode = process.env.SENTRY_LIGHTHOUSE_MODE;

// Event listeners are attached synchronously at module top-level so E2E tests that do
// `page.goto('/')` followed immediately by `button.click()` cannot race the dynamic
// `import('@sentry/browser')` below. The handlers don't depend on Sentry being
// initialized — Sentry's global error/transaction handlers attach via window-level
// listeners installed by `Sentry.init()` and pick up the thrown error regardless.
document.getElementById('exception-button').addEventListener('click', () => {
  throw new Error('I am an error!');
});

document.getElementById('navigation-link').addEventListener('click', () => {
  document.getElementById('navigation-target').scrollIntoView({ behavior: 'smooth' });
});

// Sentry is loaded via dynamic `import()` so the `no-sentry` Lighthouse build can
// tree-shake the SDK out completely. Wrapped in an async IIFE because top-level await
// isn't supported by the webpack target used for this app's bundle.
if (lighthouseMode !== 'no-sentry') {
  void (async () => {
    const Sentry = await import('@sentry/browser');

    const integrations = [];

    // Existing E2E behavior (empty string) and 'tracing-replay' mode both include tracing.
    // 'init-only' mode omits all integrations so we can measure SDK-core overhead.
    if (lighthouseMode !== 'init-only') {
      integrations.push(Sentry.browserTracingIntegration());
    }

    // Replay is gated to 'tracing-replay' so we can measure its overhead independently
    // from tracing. Existing E2E behavior (unset env var) did not include replay, so we
    // preserve that.
    if (lighthouseMode === 'tracing-replay') {
      integrations.push(Sentry.replayIntegration());
    }

    Sentry.init({
      dsn: process.env.E2E_TEST_DSN,
      integrations,
      tracesSampleRate: 1.0,
      replaysSessionSampleRate: lighthouseMode === 'tracing-replay' ? 1.0 : 0,
      replaysOnErrorSampleRate: lighthouseMode === 'tracing-replay' ? 1.0 : 0,
      release: 'e2e-test',
      environment: 'qa',
      tunnel: 'http://localhost:3031',
    });
  })();
}
