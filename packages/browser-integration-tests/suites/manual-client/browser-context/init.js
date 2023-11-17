import {
  BrowserClient,
  Breadcrumbs,
  Dedupe,
  FunctionToString,
  HttpContext,
  InboundFilters,
  LinkedErrors,
  defaultStackParser,
  makeFetchTransport,
  Hub,
} from '@sentry/browser';

const integrations = [
  new Breadcrumbs(),
  new FunctionToString(),
  new Dedupe(),
  new HttpContext(),
  new InboundFilters(),
  new LinkedErrors(),
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
  debug: true,
});

const hub = new Hub(client);

hub.captureException(new Error('test client'));
