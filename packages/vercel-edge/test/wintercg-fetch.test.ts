import * as sentryCore from '@sentry/core';
import type { HandlerDataFetch, Integration } from '@sentry/types';
import * as sentryUtils from '@sentry/utils';
import { createStackParser } from '@sentry/utils';

import { VercelEdgeClient } from '../src/index';
import { winterCGFetchIntegration } from '../src/integrations/wintercg-fetch';

class FakeClient extends VercelEdgeClient {
  public getIntegrationByName<T extends Integration = Integration>(name: string): T | undefined {
    return name === 'WinterCGFetch' ? (winterCGFetchIntegration() as Integration as T) : undefined;
  }
}

const addFetchInstrumentationHandlerSpy = jest.spyOn(sentryUtils, 'addFetchInstrumentationHandler');
const instrumentFetchRequestSpy = jest.spyOn(sentryCore, 'instrumentFetchRequest');
const addBreadcrumbSpy = jest.spyOn(sentryCore, 'addBreadcrumb');

describe('WinterCGFetch instrumentation', () => {
  let client: FakeClient;

  beforeEach(() => {
    jest.clearAllMocks();

    client = new FakeClient({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      enableTracing: true,
      tracesSampleRate: 1,
      integrations: [],
      transport: () => ({
        send: () => Promise.resolve({}),
        flush: () => Promise.resolve(true),
      }),
      tracePropagationTargets: ['http://my-website.com/'],
      stackParser: createStackParser(),
    });

    jest.spyOn(sentryCore, 'getClient').mockImplementation(() => client);
  });

  it('should call `instrumentFetchRequest` for outgoing fetch requests', () => {
    addFetchInstrumentationHandlerSpy.mockImplementationOnce(() => undefined);

    const integration = winterCGFetchIntegration();
    integration.setupOnce!();
    integration.setup!(client);

    const [fetchInstrumentationHandlerCallback] = addFetchInstrumentationHandlerSpy.mock.calls[0];
    expect(fetchInstrumentationHandlerCallback).toBeDefined();

    const startHandlerData: HandlerDataFetch = {
      fetchData: { url: 'http://my-website.com/', method: 'POST' },
      args: ['http://my-website.com/'],
      startTimestamp: Date.now(),
    };
    fetchInstrumentationHandlerCallback(startHandlerData);

    expect(instrumentFetchRequestSpy).toHaveBeenCalledWith(
      startHandlerData,
      expect.any(Function),
      expect.any(Function),
      expect.any(Object),
      'auto.http.wintercg_fetch',
    );

    const [, shouldCreateSpan, shouldAttachTraceData] = instrumentFetchRequestSpy.mock.calls[0];

    expect(shouldAttachTraceData('http://my-website.com/')).toBe(true);
    expect(shouldAttachTraceData('https://www.3rd-party-website.at/')).toBe(false);

    expect(shouldCreateSpan('http://my-website.com/')).toBe(true);
    expect(shouldCreateSpan('https://www.3rd-party-website.at/')).toBe(true);
  });

  it('should not instrument if client is not setup', () => {
    addFetchInstrumentationHandlerSpy.mockImplementationOnce(() => undefined);

    const integration = winterCGFetchIntegration();
    integration.setupOnce!();
    // integration.setup!(client) is not called!

    const [fetchInstrumentationHandlerCallback] = addFetchInstrumentationHandlerSpy.mock.calls[0];
    expect(fetchInstrumentationHandlerCallback).toBeDefined();

    const startHandlerData: HandlerDataFetch = {
      fetchData: { url: 'http://my-website.com/', method: 'POST' },
      args: ['http://my-website.com/'],
      startTimestamp: Date.now(),
    };
    fetchInstrumentationHandlerCallback(startHandlerData);

    expect(instrumentFetchRequestSpy).not.toHaveBeenCalled();
  });

  it('should call `instrumentFetchRequest` for outgoing fetch requests to Sentry', () => {
    addFetchInstrumentationHandlerSpy.mockImplementationOnce(() => undefined);

    const integration = winterCGFetchIntegration();
    integration.setupOnce!();
    integration.setup!(client);

    const [fetchInstrumentationHandlerCallback] = addFetchInstrumentationHandlerSpy.mock.calls[0];
    expect(fetchInstrumentationHandlerCallback).toBeDefined();

    const startHandlerData: HandlerDataFetch = {
      fetchData: { url: 'https://dsn.ingest.sentry.io/1337', method: 'POST' },
      args: ['https://dsn.ingest.sentry.io/1337'],
      startTimestamp: Date.now(),
    };
    fetchInstrumentationHandlerCallback(startHandlerData);

    expect(instrumentFetchRequestSpy).not.toHaveBeenCalled();
  });

  it('should properly apply the `shouldCreateSpanForRequest` option', () => {
    addFetchInstrumentationHandlerSpy.mockImplementationOnce(() => undefined);

    const integration = winterCGFetchIntegration({
      shouldCreateSpanForRequest(url) {
        return url === 'http://only-acceptable-url.com/';
      },
    });
    integration.setupOnce!();
    integration.setup!(client);

    const [fetchInstrumentationHandlerCallback] = addFetchInstrumentationHandlerSpy.mock.calls[0];
    expect(fetchInstrumentationHandlerCallback).toBeDefined();

    const startHandlerData: HandlerDataFetch = {
      fetchData: { url: 'http://my-website.com/', method: 'POST' },
      args: ['http://my-website.com/'],
      startTimestamp: Date.now(),
    };
    fetchInstrumentationHandlerCallback(startHandlerData);

    const [, shouldCreateSpan] = instrumentFetchRequestSpy.mock.calls[0];

    expect(shouldCreateSpan('http://only-acceptable-url.com/')).toBe(true);
    expect(shouldCreateSpan('http://my-website.com/')).toBe(false);
    expect(shouldCreateSpan('https://www.3rd-party-website.at/')).toBe(false);
  });

  it('should create a breadcrumb for an outgoing request', () => {
    addFetchInstrumentationHandlerSpy.mockImplementationOnce(() => undefined);

    const integration = winterCGFetchIntegration();
    integration.setupOnce!();
    integration.setup!(client);

    const [fetchInstrumentationHandlerCallback] = addFetchInstrumentationHandlerSpy.mock.calls[0];
    expect(fetchInstrumentationHandlerCallback).toBeDefined();

    const startTimestamp = Date.now();
    const endTimestamp = Date.now() + 100;

    const startHandlerData: HandlerDataFetch = {
      fetchData: { url: 'http://my-website.com/', method: 'POST' },
      args: ['http://my-website.com/'],
      response: { ok: true, status: 201, url: 'http://my-website.com/' } as Response,
      startTimestamp,
      endTimestamp,
    };
    fetchInstrumentationHandlerCallback(startHandlerData);

    expect(addBreadcrumbSpy).toBeCalledWith(
      {
        category: 'fetch',
        data: { method: 'POST', status_code: 201, url: 'http://my-website.com/' },
        type: 'http',
      },
      {
        endTimestamp,
        input: ['http://my-website.com/'],
        response: { ok: true, status: 201, url: 'http://my-website.com/' },
        startTimestamp,
      },
    );
  });

  it('should not create a breadcrumb for an outgoing request if `breadcrumbs: false` is set', () => {
    addFetchInstrumentationHandlerSpy.mockImplementationOnce(() => undefined);

    const integration = winterCGFetchIntegration({ breadcrumbs: false });
    integration.setupOnce!();
    integration.setup!(client);

    const [fetchInstrumentationHandlerCallback] = addFetchInstrumentationHandlerSpy.mock.calls[0];
    expect(fetchInstrumentationHandlerCallback).toBeDefined();

    const startTimestamp = Date.now();
    const endTimestamp = Date.now() + 100;

    const startHandlerData: HandlerDataFetch = {
      fetchData: { url: 'http://my-website.com/', method: 'POST' },
      args: ['http://my-website.com/'],
      response: { ok: true, status: 201, url: 'http://my-website.com/' } as Response,
      startTimestamp,
      endTimestamp,
    };
    fetchInstrumentationHandlerCallback(startHandlerData);

    expect(addBreadcrumbSpy).not.toHaveBeenCalled();
  });
});
