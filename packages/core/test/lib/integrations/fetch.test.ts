import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as breadcrumbsModule from '../../../src/breadcrumbs';
import * as currentScopesModule from '../../../src/currentScopes';
import * as fetchModule from '../../../src/fetch';
import { createFetchIntegration } from '../../../src/integrations/fetch';
import * as instrumentFetchModule from '../../../src/instrument/fetch';
import type { HandlerDataFetch } from '../../../src/types/instrument';
import type { Integration } from '../../../src/types/integration';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

const fetchIntegration = createFetchIntegration({ name: 'Fetch', spanOrigin: 'auto.http.fetch' });

class FakeClient extends TestClient {
  public getIntegrationByName<T extends Integration = Integration>(name: string): T | undefined {
    return name === 'Fetch' ? (fetchIntegration() as T) : undefined;
  }
}

const addFetchInstrumentationHandlerSpy = vi.spyOn(instrumentFetchModule, 'addFetchInstrumentationHandler');
const instrumentFetchRequestSpy = vi.spyOn(fetchModule, 'instrumentFetchRequest');
const addBreadcrumbSpy = vi.spyOn(breadcrumbsModule, 'addBreadcrumb');

function makeClient(options: Partial<Parameters<typeof getDefaultTestClientOptions>[0]> = {}): FakeClient {
  return new FakeClient(
    getDefaultTestClientOptions({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate: 1,
      tracePropagationTargets: ['http://my-website.com/'],
      ...options,
    }),
  );
}

/** Registers the integration against `client` and returns the handler it installed. */
function setupIntegration(
  integration: ReturnType<typeof fetchIntegration>,
  client: FakeClient,
): (handlerData: HandlerDataFetch) => void {
  addFetchInstrumentationHandlerSpy.mockImplementationOnce(() => () => undefined);
  integration.setupOnce!();
  integration.setup!(client);

  const [handler] = addFetchInstrumentationHandlerSpy.mock.calls[0]!;
  expect(handler).toBeDefined();
  return handler;
}

const startHandlerData: HandlerDataFetch = {
  fetchData: { url: 'http://my-website.com/', method: 'POST' },
  args: ['http://my-website.com/'],
  startTimestamp: Date.now(),
};

describe('createFetchIntegration', () => {
  let client: FakeClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = makeClient();
    vi.spyOn(currentScopesModule, 'getClient').mockImplementation(() => client);
  });

  it('calls `instrumentFetchRequest` for outgoing fetch requests', () => {
    const handler = setupIntegration(fetchIntegration(), client);
    handler(startHandlerData);

    expect(instrumentFetchRequestSpy).toHaveBeenCalledWith(
      startHandlerData,
      expect.any(Function),
      expect.any(Function),
      expect.any(Object),
      { spanOrigin: 'auto.http.fetch', propagateTraceparent: undefined },
    );

    const [, , shouldAttachTraceData] = instrumentFetchRequestSpy.mock.calls[0]!;

    expect(shouldAttachTraceData('http://my-website.com/')).toBe(true);
    expect(shouldAttachTraceData('https://www.3rd-party-website.at/')).toBe(false);
    // tracePropagationTargets match regardless of casing
    expect(shouldAttachTraceData('http://MY-WEBSITE.com/')).toBe(true);
  });

  it('uses the span origin it was created with', () => {
    const winterCGFetchIntegration = createFetchIntegration({
      name: 'WinterCGFetch',
      spanOrigin: 'auto.http.wintercg_fetch',
    });

    const handler = setupIntegration(winterCGFetchIntegration(), client);
    handler(startHandlerData);

    expect(instrumentFetchRequestSpy).toHaveBeenCalledWith(
      startHandlerData,
      expect.any(Function),
      expect.any(Function),
      expect.any(Object),
      expect.objectContaining({ spanOrigin: 'auto.http.wintercg_fetch' }),
    );
  });

  it('forwards the client `propagateTraceparent` option', () => {
    client = makeClient({ propagateTraceparent: true });
    const handler = setupIntegration(fetchIntegration(), client);
    handler(startHandlerData);

    expect(instrumentFetchRequestSpy).toHaveBeenCalledWith(
      startHandlerData,
      expect.any(Function),
      expect.any(Function),
      expect.any(Object),
      expect.objectContaining({ propagateTraceparent: true }),
    );
  });

  it('does not instrument if the client is not set up', () => {
    addFetchInstrumentationHandlerSpy.mockImplementationOnce(() => () => undefined);
    const integration = fetchIntegration();
    integration.setupOnce!();
    // no `setup(client)` call

    const [handler] = addFetchInstrumentationHandlerSpy.mock.calls[0]!;
    handler!(startHandlerData);

    expect(instrumentFetchRequestSpy).not.toHaveBeenCalled();
  });

  it('does not instrument outgoing requests to Sentry', () => {
    const handler = setupIntegration(fetchIntegration(), client);
    handler({
      fetchData: { url: 'https://dsn.ingest.sentry.io/1337?sentry_key=public', method: 'POST' },
      args: ['https://dsn.ingest.sentry.io/1337?sentry_key=public'],
      startTimestamp: Date.now(),
    });

    expect(instrumentFetchRequestSpy).not.toHaveBeenCalled();
    expect(addBreadcrumbSpy).not.toHaveBeenCalled();
  });

  it('applies the `shouldCreateSpanForRequest` option', () => {
    const handler = setupIntegration(
      fetchIntegration({ shouldCreateSpanForRequest: url => url === 'http://only-this-one.com/' }),
      client,
    );
    handler(startHandlerData);

    const [, shouldCreateSpan] = instrumentFetchRequestSpy.mock.calls[0]!;

    expect(shouldCreateSpan('http://only-this-one.com/')).toBe(true);
    expect(shouldCreateSpan('http://my-website.com/')).toBe(false);
  });

  it('attaches trace data by default', () => {
    const handler = setupIntegration(fetchIntegration(), client);
    handler(startHandlerData);

    const [, , shouldAttachTraceData] = instrumentFetchRequestSpy.mock.calls[0]!;
    expect(shouldAttachTraceData('http://my-website.com/')).toBe(true);
  });

  it('attaches no trace data when `tracePropagation: false` is set', () => {
    const handler = setupIntegration(fetchIntegration({ tracePropagation: false }), client);
    handler(startHandlerData);

    const [, , shouldAttachTraceData] = instrumentFetchRequestSpy.mock.calls[0]!;
    expect(shouldAttachTraceData('http://my-website.com/')).toBe(false);
  });

  it('still creates spans when `tracePropagation: false` is set', () => {
    const handler = setupIntegration(fetchIntegration({ tracePropagation: false }), client);
    handler(startHandlerData);

    const [, shouldCreateSpan] = instrumentFetchRequestSpy.mock.calls[0]!;
    expect(shouldCreateSpan('http://my-website.com/')).toBe(true);
  });

  it('creates a breadcrumb for an outgoing request', () => {
    const handler = setupIntegration(fetchIntegration(), client);

    const startTimestamp = Date.now();
    const endTimestamp = startTimestamp + 100;
    const response = { status: 200 } as Response;

    handler({
      fetchData: { url: 'http://my-website.com/', method: 'POST', request_body_size: 10, response_body_size: 20 },
      args: ['http://my-website.com/'],
      startTimestamp,
      endTimestamp,
      response,
    });

    expect(addBreadcrumbSpy).toHaveBeenCalledWith(
      {
        category: 'fetch',
        data: {
          method: 'POST',
          url: 'http://my-website.com/',
          request_body_size: 10,
          response_body_size: 20,
          status_code: 200,
        },
        type: 'http',
      },
      {
        input: ['http://my-website.com/'],
        response,
        startTimestamp,
        endTimestamp,
      },
    );
  });

  it('creates an error-level breadcrumb for a failed request', () => {
    const handler = setupIntegration(fetchIntegration(), client);

    const error = new Error('kaboom');
    const startTimestamp = Date.now();
    const endTimestamp = startTimestamp + 100;

    handler({
      fetchData: { url: 'http://my-website.com/', method: 'POST' },
      args: ['http://my-website.com/'],
      startTimestamp,
      endTimestamp,
      error,
    });

    expect(addBreadcrumbSpy).toHaveBeenCalledWith(
      {
        category: 'fetch',
        data: { method: 'POST', url: 'http://my-website.com/' },
        level: 'error',
        type: 'http',
      },
      {
        data: error,
        input: ['http://my-website.com/'],
        startTimestamp,
        endTimestamp,
      },
    );
  });

  it('creates no breadcrumb when `breadcrumbs: false` is set', () => {
    const handler = setupIntegration(fetchIntegration({ breadcrumbs: false }), client);

    handler({
      fetchData: { url: 'http://my-website.com/', method: 'POST' },
      args: ['http://my-website.com/'],
      startTimestamp: Date.now(),
      endTimestamp: Date.now() + 100,
      response: { status: 200 } as Response,
    });

    expect(addBreadcrumbSpy).not.toHaveBeenCalled();
  });

  it('bounds the pending-span record when requests never settle', () => {
    // `instrumentFetchRequest` runs for real here, so the record the spy captured is the live one.
    const handler = setupIntegration(fetchIntegration(), client);

    // Start events only: no end event ever arrives, so nothing deletes these entries.
    for (let i = 0; i < 5000; i++) {
      handler({
        fetchData: { url: `http://my-website.com/${i}`, method: 'GET' },
        args: [`http://my-website.com/${i}`],
        startTimestamp: Date.now(),
      });
    }

    const pendingSpans = instrumentFetchRequestSpy.mock.calls[0]![3];

    // The cap is 1000, swept once every 1000 starts, so at most 2000 entries survive.
    expect(Object.keys(pendingSpans).length).toBeLessThanOrEqual(2000);
  });

  it('uses each client own options when a second client is set up', () => {
    // `setupOnce` runs once per process, so the handler must read the options of whichever client
    // is current rather than the ones captured by the first instance.
    const handler = setupIntegration(fetchIntegration({ breadcrumbs: false }), client);

    const secondClient = makeClient();
    fetchIntegration({ breadcrumbs: true, shouldCreateSpanForRequest: () => false }).setup!(secondClient);
    vi.spyOn(currentScopesModule, 'getClient').mockImplementation(() => secondClient);

    handler({
      fetchData: { url: 'http://my-website.com/', method: 'POST' },
      args: ['http://my-website.com/'],
      startTimestamp: Date.now(),
      endTimestamp: Date.now() + 100,
      response: { status: 200 } as Response,
    });

    const [, shouldCreateSpan] = instrumentFetchRequestSpy.mock.calls[0]!;
    expect(shouldCreateSpan('http://my-website.com/')).toBe(false);
    expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
  });
});
