import type { Transaction } from '@sentry/core';
import { Hub, makeMain } from '@sentry/core';
import * as http from 'http';
import type { fetch as FetchType } from 'undici';

import { NodeClient } from '../../src/client';
import type { UndiciOptions } from '../../src/integrations/undici';
import { Undici } from '../../src/integrations/undici';
import { getDefaultNodeClientOptions } from '../helper/node-client-options';
import { conditionalTest } from '../utils';

const SENTRY_DSN = 'https://0@0.ingest.sentry.io/0';

let hub: Hub;
let fetch: typeof FetchType;

beforeAll(async () => {
  await setupTestServer();
  try {
    // need to conditionally require `undici` because it's not available in Node 10
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    fetch = require('undici').fetch;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Undici integration tests are skipped because undici is not installed.');
  }
});

const DEFAULT_OPTIONS = getDefaultNodeClientOptions({
  dsn: SENTRY_DSN,
  tracesSampleRate: 1,
  integrations: [new Undici()],
});

beforeEach(() => {
  const client = new NodeClient(DEFAULT_OPTIONS);
  hub = new Hub(client);
  makeMain(hub);
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
      'http://localhost:18099',
      undefined,
      {
        description: 'GET http://localhost:18099/',
        op: 'http.client',
        data: expect.objectContaining({
          'http.method': 'GET',
        }),
      },
    ],
    [
      'url with query',
      'http://localhost:18099?foo=bar',
      undefined,
      {
        description: 'GET http://localhost:18099/',
        op: 'http.client',
        data: expect.objectContaining({
          'http.method': 'GET',
          'http.query': '?foo=bar',
        }),
      },
    ],
    [
      'url with POST method',
      'http://localhost:18099',
      { method: 'POST' },
      {
        description: 'POST http://localhost:18099/',
        data: expect.objectContaining({
          'http.method': 'POST',
        }),
      },
    ],
    [
      'url with POST method',
      'http://localhost:18099',
      { method: 'POST' },
      {
        description: 'POST http://localhost:18099/',
        data: expect.objectContaining({
          'http.method': 'POST',
        }),
      },
    ],
    [
      'url with GET as default',
      'http://localhost:18099',
      { method: undefined },
      {
        description: 'GET http://localhost:18099/',
      },
    ],
  ])('creates a span with a %s', async (_: string, request, requestInit, expected) => {
    const transaction = hub.startTransaction({ name: 'test-transaction' }) as Transaction;
    hub.getScope().setSpan(transaction);

    await fetch(request, requestInit);

    expect(transaction.spanRecorder?.spans.length).toBe(2);

    const span = transaction.spanRecorder?.spans[1];
    expect(span).toEqual(expect.objectContaining(expected));
  });

  it('creates a span with internal errors', async () => {
    const transaction = hub.startTransaction({ name: 'test-transaction' }) as Transaction;
    hub.getScope().setSpan(transaction);

    try {
      await fetch('http://a-url-that-no-exists.com');
    } catch (e) {
      // ignore
    }

    expect(transaction.spanRecorder?.spans.length).toBe(2);

    const span = transaction.spanRecorder?.spans[1];
    expect(span).toEqual(expect.objectContaining({ status: 'internal_error' }));
  });

  it('creates a span for invalid looking urls', async () => {
    const transaction = hub.startTransaction({ name: 'test-transaction' }) as Transaction;
    hub.getScope().setSpan(transaction);

    try {
      // Intentionally add // to the url
      // fetch accepts this URL, but throws an error later on
      await fetch('http://a-url-that-no-exists.com//');
    } catch (e) {
      // ignore
    }

    expect(transaction.spanRecorder?.spans.length).toBe(2);

    const span = transaction.spanRecorder?.spans[1];
    expect(span).toEqual(expect.objectContaining({ description: 'GET http://a-url-that-no-exists.com//' }));
    expect(span).toEqual(expect.objectContaining({ status: 'internal_error' }));
  });

  it('does not create a span for sentry requests', async () => {
    const transaction = hub.startTransaction({ name: 'test-transaction' }) as Transaction;
    hub.getScope().setSpan(transaction);

    try {
      await fetch(`${SENTRY_DSN}/sub/route`, {
        method: 'POST',
      });
    } catch (e) {
      // ignore
    }

    expect(transaction.spanRecorder?.spans.length).toBe(1);
  });

  it('does not create a span if there is no active spans', async () => {
    try {
      await fetch(`${SENTRY_DSN}/sub/route`, { method: 'POST' });
    } catch (e) {
      // ignore
    }

    expect(hub.getScope().getSpan()).toBeUndefined();
  });

  it('does create a span if `shouldCreateSpanForRequest` is defined', async () => {
    const transaction = hub.startTransaction({ name: 'test-transaction' }) as Transaction;
    hub.getScope().setSpan(transaction);

    const undoPatch = patchUndici(hub, { shouldCreateSpanForRequest: url => url.includes('yes') });

    await fetch('http://localhost:18099/no', { method: 'POST' });

    expect(transaction.spanRecorder?.spans.length).toBe(1);

    await fetch('http://localhost:18099/yes', { method: 'POST' });

    expect(transaction.spanRecorder?.spans.length).toBe(2);

    undoPatch();
  });

  it('attaches the sentry trace and baggage headers', async () => {
    const transaction = hub.startTransaction({ name: 'test-transaction' }) as Transaction;
    hub.getScope().setSpan(transaction);

    await fetch('http://localhost:18099', { method: 'POST' });

    expect(transaction.spanRecorder?.spans.length).toBe(2);
    const span = transaction.spanRecorder?.spans[1];

    expect(requestHeaders['sentry-trace']).toEqual(span?.toTraceparent());
    expect(requestHeaders['baggage']).toEqual(
      `sentry-environment=production,sentry-public_key=0,sentry-trace_id=${transaction.traceId},sentry-sample_rate=1,sentry-transaction=test-transaction`,
    );
  });

  it('does not attach headers if `shouldCreateSpanForRequest` does not create a span', async () => {
    const transaction = hub.startTransaction({ name: 'test-transaction' }) as Transaction;
    hub.getScope().setSpan(transaction);

    const undoPatch = patchUndici(hub, { shouldCreateSpanForRequest: url => url.includes('yes') });

    await fetch('http://localhost:18099/no', { method: 'POST' });

    expect(requestHeaders['sentry-trace']).toBeUndefined();
    expect(requestHeaders['baggage']).toBeUndefined();

    await fetch('http://localhost:18099/yes', { method: 'POST' });

    expect(requestHeaders['sentry-trace']).toBeDefined();
    expect(requestHeaders['baggage']).toBeDefined();

    undoPatch();
  });

  it('uses tracePropagationTargets', async () => {
    const transaction = hub.startTransaction({ name: 'test-transaction' }) as Transaction;
    hub.getScope().setSpan(transaction);

    const client = new NodeClient({ ...DEFAULT_OPTIONS, tracePropagationTargets: ['/yes'] });
    hub.bindClient(client);

    expect(transaction.spanRecorder?.spans.length).toBe(1);

    await fetch('http://localhost:18099/no', { method: 'POST' });

    expect(transaction.spanRecorder?.spans.length).toBe(2);

    expect(requestHeaders['sentry-trace']).toBeUndefined();
    expect(requestHeaders['baggage']).toBeUndefined();

    await fetch('http://localhost:18099/yes', { method: 'POST' });

    expect(transaction.spanRecorder?.spans.length).toBe(3);

    expect(requestHeaders['sentry-trace']).toBeDefined();
    expect(requestHeaders['baggage']).toBeDefined();
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
            url: 'http://localhost:18099/',
          },
          type: 'http',
          timestamp: expect.any(Number),
        });
        return breadcrumb;
      },
    });
    hub.bindClient(client);

    await fetch('http://localhost:18099', { method: 'POST' });
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
    hub.bindClient(client);

    try {
      await fetch('http://a-url-that-no-exists.com');
    } catch (e) {
      // ignore
    }
  });

  it('does not add a breadcrumb if disabled', async () => {
    expect.assertions(0);

    const undoPatch = patchUndici(hub, { breadcrumbs: false });

    await fetch('http://localhost:18099', { method: 'POST' });

    undoPatch();
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
    res.connection.end();
  });

  testServer.listen(18099, 'localhost');

  return new Promise(resolve => {
    testServer?.on('listening', resolve);
  });
}

function patchUndici(hub: Hub, userOptions: Partial<UndiciOptions>): () => void {
  let options: any = {};
  const client = hub.getClient();
  if (client) {
    const undici = client.getIntegration(Undici);
    if (undici) {
      // @ts-ignore need to access private property
      options = { ...undici._options };
      // @ts-ignore need to access private property
      undici._options = Object.assign(undici._options, userOptions);
    }
  }

  return () => {
    const client = hub.getClient();
    if (client) {
      const undici = client.getIntegration(Undici);
      if (undici) {
        // @ts-ignore need to access private property
        undici._options = { ...options };
      }
    }
  };
}
