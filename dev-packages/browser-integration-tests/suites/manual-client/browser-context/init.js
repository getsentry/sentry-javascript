import {
  breadcrumbsIntegration,
  BrowserClient,
  dedupeIntegration,
  defaultStackParser,
  eventFiltersIntegration,
  functionToStringIntegration,
  httpContextIntegration,
  linkedErrorsIntegration,
  makeFetchTransport,
  Scope,
} from '@sentry/browser';

const integrations = [
  breadcrumbsIntegration(),
  functionToStringIntegration(),
  dedupeIntegration(),
  httpContextIntegration(),
  eventFiltersIntegration(),
  linkedErrorsIntegration(),
];

const client = new BrowserClient({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '0.0.1',
  environment: 'local',
  sampleRate: 1.0,
  tracesSampleRate: 0.0,
  transport: makeFetchTransport,
  stackParser: defaultStackParser,
  integrations,
});

const scope = new Scope();
scope.setClient(client);

client.init();

scope.captureException(new Error('test client'));
