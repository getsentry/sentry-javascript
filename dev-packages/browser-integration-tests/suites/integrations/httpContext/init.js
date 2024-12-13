import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

const integrations = Sentry.getDefaultIntegrations({}).filter(
  defaultIntegration => defaultIntegration.name === 'HttpContext',
);

const client = new Sentry.BrowserClient({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: Sentry.makeFetchTransport,
  stackParser: Sentry.defaultStackParser,
  integrations: integrations,
});

const scope = new Sentry.Scope();
scope.setClient(client);
client.init();

window._sentryScope = scope;
