import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { createTransport, Hub, makeMain } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { Resource } from '@opentelemetry/resources';

import { addExtensionMethods } from '@sentry/tracing';
import { resolvedSyncPromise } from '@sentry/utils';
import { SentrySpanProcessor } from '../src/spanprocessor';

const SENTRY_DSN = 'https://0@0.ingest.sentry.io/0';

const DEFAULT_NODE_CLIENT_OPTIONS = {
  dsn: SENTRY_DSN,
  integrations: [],
  transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
  stackParser: () => [],
};

// Integration Test of SentrySpanProcessor

beforeAll(() => {
  addExtensionMethods();
});

describe('SentrySpanProcessor', () => {
  let hub: Hub;
  let client: NodeClient;
  let provider: NodeTracerProvider;
  let spanProcessor: SentrySpanProcessor;

  beforeEach(() => {
    client = new NodeClient(DEFAULT_NODE_CLIENT_OPTIONS);
    hub = new Hub(client);
    makeMain(hub);

    spanProcessor = new SentrySpanProcessor();
    provider = new NodeTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'test-service',
      }),
    });
    provider.addSpanProcessor(spanProcessor);
    provider.register();
  });

  afterEach(async () => {
    await provider.forceFlush();
    await provider.shutdown();
  });
});
