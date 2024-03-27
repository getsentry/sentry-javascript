import * as http from 'http';
import {
  Transaction,
  getActiveSpan,
  getClient,
  getCurrentScope,
  getIsolationScope,
  getMainCarrier,
  getSpanDescendants,
  setCurrentClient,
  spanToJSON,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import { spanToTraceHeader } from '@sentry/core';
import { fetch } from 'undici';

import { NodeClient } from '../../src/client';
import type { Undici, UndiciOptions } from '../../src/integrations/undici';
import { nativeNodeFetchintegration } from '../../src/integrations/undici';
import { getDefaultNodeClientOptions } from '../helper/node-client-options';
import { conditionalTest } from '../utils';

const SENTRY_DSN = 'https://0@0.ingest.sentry.io/0';

beforeAll(async () => {
  try {
    await setupTestServer();
  } catch (e) {
    const error = new Error('Undici integration tests are skipped because test server could not be set up.');
    // This needs lib es2022 and newer so marking as any
    (error as any).cause = e;
    throw e;
  }
});

const DEFAULT_OPTIONS = getDefaultNodeClientOptions({
  dsn: SENTRY_DSN,
  tracesSampler: () => true,
  integrations: [nativeNodeFetchintegration()],
  debug: true,
});

beforeEach(() => {
  // Ensure we reset a potentially set acs to use the default
  const sentry = getMainCarrier().__SENTRY__;
  if (sentry) {
    sentry.acs = undefined;
  }

  getCurrentScope().clear();
  getIsolationScope().clear();
  const client = new NodeClient(DEFAULT_OPTIONS);
  setCurrentClient(client);
  client.init();
});

afterEach(() => {
  requestHeaders = {};
  setTestServerOptions({ statusCode: 200 });
});

afterAll(() => {
  getTestServer()?.close();
});

conditionalTest({ min: 16 })('Undici integration', () => {
  it.each([
    [
      'simple url',
      'http://localhost:18100',
      undefined,
      {
        description: 'GET http://localhost:18100/',
        op: 'http.client',
        data: expect.objectContaining({
          'http.method': 'GET',
        }),
      },
    ],
    [
      'url with query',
      'http://localhost:18100?foo=bar',
      undefined,
      {
        description: 'GET http://localhost:18100/',
        op: 'http.client',
        data: expect.objectContaining({
          'http.method': 'GET',
          'http.query': '?foo=bar',
        }),
      },
    ],
    [
      'url with POST method',
      'http://localhost:18100',
      { method: 'POST' },
      {
        description: 'POST http://localhost:18100/',
        data: expect.objectContaining({
          'http.method': 'POST',
        }),
      },
    ],
    [
      'url with POST method',
      'http://localhost:18100',
      { method: 'POST' },
      {
        description: 'POST http://localhost:18100/',
        data: expect.objectContaining({
          'http.method': 'POST',
        }),
      },
    ],
    [
      'url with GET as default',
      'http://localhost:18100',
      { method: undefined },
      {
        description: 'GET http://localhost:18100/',
      },
    ],
  ])('creates a span with a %s', async (_: string, request, requestInit, expected) => {
    await startSpan({ name: 'outer-span' }, async outerSpan => {
      await fetch(request, requestInit);

      expect(outerSpan).toBeInstanceOf(Transaction);
      const spans = getSpanDescendants(outerSpan);

      expect(spans.length).toBe(2);

      const span = spanToJSON(spans[1]);
      expect(span).toEqual(expect.objectContaining(expected));
    });
  });

  it('creates a span with internal errors', async () => {
    await startSpan({ name: 'outer-span' }, async outerSpan => {
      try {
        await fetch('http://a-url-that-no-exists.com');
      } catch (e) {
        // ignore
      }

      expect(outerSpan).toBeInstanceOf(Transaction);
      const spans = getSpanDescendants(outerSpan);

      expect(spans.length).toBe(2);

      const span = spans[1];
      expect(spanToJSON(span).status).toEqual('internal_error');
    });
  });

  it('creates a span for invalid looking urls', async () => {
    await startSpan({ name: 'outer-span' }, async outerSpan => {
      try {
        // Intentionally add // to the url
        // fetch accepts this URL, but throws an error later on
        await fetch('http://a-url-that-no-exists.com//');
      } catch (e) {
        // ignore
      }

      expect(outerSpan).toBeInstanceOf(Transaction);
      const spans = getSpanDescendants(outerSpan);

      expect(spans.length).toBe(2);

      const spanJson = spanToJSON(spans[1]);
      expect(spanJson.description).toEqual('GET http://a-url-that-no-exists.com//');
      expect(spanJson.status).toEqual('internal_error');
    });
  });

  it('does not create a span for sentry requests', async () => {
    await startSpan({ name: 'outer-span' }, async outerSpan => {
      try {
        await fetch(`${SENTRY_DSN}/sub/route`, {
          method: 'POST',
        });
      } catch (e) {
        // ignore
      }

      expect(outerSpan).toBeInstanceOf(Transaction);
      const spans = getSpanDescendants(outerSpan);

      expect(spans.length).toBe(1);
    });
  });

  it('does not create a span if there is no active spans', async () => {
    try {
      await fetch(`${SENTRY_DSN}/sub/route`, { method: 'POST' });
    } catch (e) {
      // ignore
    }

    expect(getActiveSpan()).toBeUndefined();
  });

  it('does create a span if `shouldCreateSpanForRequest` is defined', async () => {
    await startSpan({ name: 'outer-span' }, async outerSpan => {
      expect(outerSpan).toBeInstanceOf(Transaction);
      expect(getSpanDescendants(outerSpan).length).toBe(1);

      const undoPatch = patchUndici({ shouldCreateSpanForRequest: url => url.includes('yes') });

      await fetch('http://localhost:18100/no', { method: 'POST' });

      expect(getSpanDescendants(outerSpan).length).toBe(1);

      await fetch('http://localhost:18100/yes', { method: 'POST' });

      expect(getSpanDescendants(outerSpan).length).toBe(2);

      undoPatch();
    });
  });

  // This flakes on CI for some reason: https://github.com/getsentry/sentry-javascript/pull/8449
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('attaches the sentry trace and baggage headers if there is an active span', async () => {
    expect.assertions(3);

    await withIsolationScope(async () => {
      await startSpan({ name: 'outer-span' }, async outerSpan => {
        expect(outerSpan).toBeInstanceOf(Transaction);
        const spans = getSpanDescendants(outerSpan);

        await fetch('http://localhost:18100', { method: 'POST' });

        expect(spans.length).toBe(2);
        const span = spans[1];

        expect(requestHeaders['sentry-trace']).toEqual(spanToTraceHeader(span));
        expect(requestHeaders['baggage']).toEqual(
          `sentry-environment=production,sentry-public_key=0,sentry-trace_id=${
            span.spanContext().traceId
          },sentry-sample_rate=1,sentry-transaction=test-transaction`,
        );
      });
    });
  });

  // This flakes on CI for some reason: https://github.com/getsentry/sentry-javascript/pull/8449
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('attaches the sentry trace and baggage headers if there is no active span', async () => {
    const scope = getCurrentScope();

    await fetch('http://localhost:18100', { method: 'POST' });

    const propagationContext = scope.getPropagationContext();

    expect(requestHeaders['sentry-trace'].includes(propagationContext.traceId)).toBe(true);
    expect(requestHeaders['baggage']).toEqual(
      `sentry-environment=production,sentry-public_key=0,sentry-trace_id=${propagationContext.traceId},sentry-sample_rate=1,sentry-transaction=test-transaction,sentry-sampled=true`,
    );
  });

  // This flakes on CI for some reason: https://github.com/getsentry/sentry-javascript/pull/8449
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('attaches headers if `shouldCreateSpanForRequest` does not create a span using propagation context', async () => {
    const scope = getCurrentScope();
    const propagationContext = scope.getPropagationContext();

    await startSpan({ name: 'outer-span' }, async outerSpan => {
      expect(outerSpan).toBeInstanceOf(Transaction);

      const undoPatch = patchUndici({ shouldCreateSpanForRequest: url => url.includes('yes') });

      await fetch('http://localhost:18100/no', { method: 'POST' });

      expect(requestHeaders['sentry-trace']).toBeDefined();
      expect(requestHeaders['baggage']).toBeDefined();

      expect(requestHeaders['sentry-trace'].includes(propagationContext.traceId)).toBe(true);
      const firstSpanId = requestHeaders['sentry-trace'].split('-')[1];

      await fetch('http://localhost:18100/yes', { method: 'POST' });

      expect(requestHeaders['sentry-trace']).toBeDefined();
      expect(requestHeaders['baggage']).toBeDefined();

      expect(requestHeaders['sentry-trace'].includes(propagationContext.traceId)).toBe(false);

      const secondSpanId = requestHeaders['sentry-trace'].split('-')[1];
      expect(firstSpanId).not.toBe(secondSpanId);

      undoPatch();
    });
  });

  // This flakes on CI for some reason: https://github.com/getsentry/sentry-javascript/pull/8449
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('uses tracePropagationTargets', async () => {
    const client = new NodeClient({ ...DEFAULT_OPTIONS, tracePropagationTargets: ['/yes'] });
    setCurrentClient(client);
    client.init();

    await startSpan({ name: 'outer-span' }, async outerSpan => {
      expect(outerSpan).toBeInstanceOf(Transaction);
      const spans = getSpanDescendants(outerSpan);

      expect(spans.length).toBe(1);

      await fetch('http://localhost:18100/no', { method: 'POST' });

      expect(spans.length).toBe(2);

      expect(requestHeaders['sentry-trace']).toBeUndefined();
      expect(requestHeaders['baggage']).toBeUndefined();

      await fetch('http://localhost:18100/yes', { method: 'POST' });

      expect(spans.length).toBe(3);

      expect(requestHeaders['sentry-trace']).toBeDefined();
      expect(requestHeaders['baggage']).toBeDefined();
    });
  });

  it('adds a breadcrumb on request', async () => {
    expect.assertions(1);

    const client = new NodeClient({
      ...DEFAULT_OPTIONS,
      beforeBreadcrumb: breadcrumb => {
        expect(breadcrumb).toEqual({
          category: 'http',
          data: {
            method: 'POST',
            status_code: 200,
            url: 'http://localhost:18100/',
          },
          type: 'http',
          timestamp: expect.any(Number),
        });
        return breadcrumb;
      },
    });
    setCurrentClient(client);
    client.init();

    await fetch('http://localhost:18100', { method: 'POST' });
  });

  it('adds a breadcrumb on errored request', async () => {
    expect.assertions(1);

    const client = new NodeClient({
      ...DEFAULT_OPTIONS,
      beforeBreadcrumb: breadcrumb => {
        expect(breadcrumb).toEqual({
          category: 'http',
          data: {
            method: 'GET',
            url: 'http://a-url-that-no-exists.com/',
          },
          level: 'error',
          type: 'http',
          timestamp: expect.any(Number),
        });
        return breadcrumb;
      },
    });
    setCurrentClient(client);
    client.init();

    try {
      await fetch('http://a-url-that-no-exists.com');
    } catch (e) {
      // ignore
    }
  });

  it('does not add a breadcrumb if disabled', async () => {
    expect.assertions(0);

    const undoPatch = patchUndici({ breadcrumbs: false });

    await fetch('http://localhost:18100', { method: 'POST' });

    undoPatch();
  });

  describe('nativeNodeFetchIntegration', () => {
    beforeEach(function () {
      const options = getDefaultNodeClientOptions({
        dsn: 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012',
        tracesSampleRate: 1.0,
        release: '1.0.0',
        environment: 'production',
      });
      const client = new NodeClient(options);
      setCurrentClient(client);
    });

    it.each([
      [undefined, { a: true, b: true }],
      [{}, { a: true, b: true }],
      [{ tracing: true }, { a: true, b: true }],
      [{ tracing: false }, { a: false, b: false }],
      [
        { tracing: false, shouldCreateSpanForRequest: () => true },
        { a: false, b: false },
      ],
      [
        { tracing: true, shouldCreateSpanForRequest: (url: string) => url === 'a' },
        { a: true, b: false },
      ],
    ])('sets correct _shouldCreateSpan filter with options=%p', (options, expected) => {
      // eslint-disable-next-line deprecation/deprecation
      const actual = nativeNodeFetchintegration(options) as unknown as Undici;

      for (const [url, shouldBe] of Object.entries(expected)) {
        expect(actual['_shouldCreateSpan'](url)).toEqual(shouldBe);
      }
    });

    it('disables tracing spans if tracing is disabled in client', () => {
      const client = new NodeClient(
        getDefaultNodeClientOptions({
          dsn: SENTRY_DSN,
          integrations: [nativeNodeFetchintegration()],
        }),
      );
      setCurrentClient(client);

      // eslint-disable-next-line deprecation/deprecation
      const actual = nativeNodeFetchintegration() as unknown as Undici;

      expect(actual['_shouldCreateSpan']('a')).toEqual(false);
      expect(actual['_shouldCreateSpan']('b')).toEqual(false);
    });

    it('enabled tracing spans if tracing is enabled in client', () => {
      const client = new NodeClient(
        getDefaultNodeClientOptions({
          dsn: SENTRY_DSN,
          integrations: [nativeNodeFetchintegration()],
          enableTracing: true,
        }),
      );
      setCurrentClient(client);

      // eslint-disable-next-line deprecation/deprecation
      const actual = nativeNodeFetchintegration() as unknown as Undici;

      expect(actual['_shouldCreateSpan']('a')).toEqual(true);
      expect(actual['_shouldCreateSpan']('b')).toEqual(true);
    });
  });
});

interface TestServerOptions {
  statusCode: number;
  responseHeaders?: Record<string, string | string[] | undefined>;
}

let testServer: http.Server | undefined;

let requestHeaders: any = {};

let testServerOptions: TestServerOptions = {
  statusCode: 200,
};

function setTestServerOptions(options: TestServerOptions): void {
  testServerOptions = { ...options };
}

function getTestServer(): http.Server | undefined {
  return testServer;
}

function setupTestServer() {
  testServer = http.createServer((req, res) => {
    const chunks: Buffer[] = [];

    req.on('data', data => {
      chunks.push(data);
    });

    req.on('end', () => {
      requestHeaders = req.headers;
    });

    res.writeHead(testServerOptions.statusCode, testServerOptions.responseHeaders);
    res.end();

    // also terminate socket because keepalive hangs connection a bit
    // eslint-disable-next-line deprecation/deprecation
    res.connection?.end();
  });

  testServer?.listen(18100);

  return new Promise(resolve => {
    testServer?.on('listening', resolve);
  });
}

function patchUndici(userOptions: Partial<UndiciOptions>): () => void {
  try {
    const undici = getClient()!.getIntegrationByName!('Undici');
    // @ts-expect-error need to access private property
    options = { ...undici._options };
    // @ts-expect-error need to access private property
    undici._options = Object.assign(undici._options, userOptions);
  } catch (_) {
    throw new Error('Could not undo patching of undici');
  }

  return () => {
    try {
      const undici = getClient()!.getIntegrationByName!('Undici');
      // @ts-expect-error Need to override readonly property
      undici!['_options'] = { ...options };
    } catch (_) {
      throw new Error('Could not undo patching of undici');
    }
  };
}
