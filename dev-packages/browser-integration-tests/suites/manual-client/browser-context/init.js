import {
  BrowserClient,
  Scope,
  breadcrumbsIntegration,
  dedupeIntegration,
  defaultStackParser,
  functionToStringIntegration,
  httpContextIntegration,
  inboundFiltersIntegration,
  linkedErrorsIntegration,
  makeFetchTransport,
} from '@sentry/browser';

const integrations = [
  breadcrumbsIntegration(),
  functionToStringIntegration(),
  dedupeIntegration(),
  httpContextIntegration(),
  inboundFiltersIntegration(),
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
