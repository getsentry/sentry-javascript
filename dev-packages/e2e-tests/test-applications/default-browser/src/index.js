const lighthouseMode = process.env.SENTRY_LIGHTHOUSE_MODE;

(async () => {
  if (lighthouseMode !== 'no-sentry') {
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
  }

  document.getElementById('exception-button').addEventListener('click', () => {
    throw new Error('I am an error!');
  });

  document.getElementById('navigation-link').addEventListener('click', () => {
    document.getElementById('navigation-target').scrollIntoView({ behavior: 'smooth' });
  });
})();
