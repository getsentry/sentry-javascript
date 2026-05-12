const lighthouseMode = process.env.SENTRY_LIGHTHOUSE_MODE;

(async () => {
  if (lighthouseMode !== 'no-sentry') {
    const Sentry = await import('@sentry/browser');

    const integrations = [];

    if (lighthouseMode !== 'init-only') {
      integrations.push(Sentry.browserTracingIntegration());
    }

    Sentry.init({
      dsn: process.env.E2E_TEST_DSN,
      integrations,
      tracesSampleRate: 1.0,
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
