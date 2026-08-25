import {
  CLIENT_ADDRESS,
  CLIENT_PORT,
  NETWORK_LOCAL_ADDRESS,
  NETWORK_LOCAL_PORT,
  NETWORK_PEER_ADDRESS,
  NETWORK_PEER_PORT,
  NETWORK_PROTOCOL_NAME,
  NETWORK_PROTOCOL_VERSION,
  NETWORK_TRANSPORT,
  SERVER_ADDRESS,
  SERVER_PORT,
  URL_FULL,
  URL_PATH,
} from '@sentry/conventions/attributes';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getIsolationScope } from '../../../../src/currentScopes';
import { setCurrentClient } from '../../../../src/sdk';
import { HTTP_ON_SERVER_REQUEST } from '../../../../src/integrations/http/constants';
import { getHttpServerSubscriptions } from '../../../../src/integrations/http/server-subscription';
import type { Event } from '../../../../src/types/event';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

describe('getHttpServerSubscriptions', () => {
  let client: TestClient;
  let server: http.Server;
  let events: Event[];

  beforeEach(() => {
    events = [];
    client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
    // Capture every event the SDK sends.
    const originalSendEvent = client.sendEvent.bind(client);
    client.sendEvent = (event, hint) => {
      events.push(event);
      return originalSendEvent(event, hint);
    };
    setCurrentClient(client);
    client.init();

    // The default core async-context strategy does not honor the isolation
    // scope passed into `withIsolationScope`, because it forks a fresh scope
    // from the singleton. Set the client on the singleton directly so the
    // span subscription's `getIsolationScope().getClient()` check passes.
    // In production with a real ACS, instrumentServer's own
    // `isolationScope.setClient(client)` handles this.
    getIsolationScope().setClient(client);
  });

  afterEach(async () => {
    getIsolationScope().setClient(undefined);
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  async function makeRequest(
    path: string,
    method: 'GET' | 'HEAD' | 'OPTIONS' = 'GET',
    extraHeaders: Record<string, string> = {},
  ): Promise<void> {
    const { port } = server.address() as AddressInfo;
    return new Promise<void>((resolve, reject) => {
      // Connection: close so the server-side `response.once('close', ...)`
      // (which ends the span) fires immediately after the response is sent,
      // instead of waiting for the agent keep-alive timeout.
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path,
          method,
          headers: { Connection: 'close', ...extraHeaders },
        },
        res => {
          // throw away response body
          res.resume();
          res.on('end', resolve);
          res.on('error', reject);
          res.resume();
        },
      );
      req.on('error', reject);
      req.end();
    });
  }

  function instrument(spans: boolean, extra: { ignoreStaticAssets?: boolean } = {}): void {
    const { [HTTP_ON_SERVER_REQUEST]: onServerRequest } = getHttpServerSubscriptions({ spans, ...extra });
    // Fire the channel listener manually with the server we're about to use.
    // This avoids depending on Node's diagnostics_channel firing (only
    // happens on Node 22.12+) and keeps the test portable.
    onServerRequest({ server }, HTTP_ON_SERVER_REQUEST);
  }

  // Wait for at least one transaction event
  async function waitForTransaction(): Promise<Event> {
    await vi.waitUntil(() => events.some(e => e.type === 'transaction'), {
      timeout: 1000,
      interval: 10,
    });
    return events.find(e => e.type === 'transaction')!;
  }

  it('creates a root http.server span for an incoming request when spans: true', async () => {
    server = http.createServer((_req, res) => res.end('ok'));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    instrument(true);

    await makeRequest('/users/42?foo=bar');
    const transaction = await waitForTransaction();

    expect(transaction.transaction).toBe('GET /users/42');
    expect(transaction.contexts?.trace).toEqual(
      expect.objectContaining({
        op: 'http.server',
        origin: 'auto.http.server',
        data: expect.objectContaining({
          'http.method': 'GET',
          'http.response.status_code': 200,
          'http.status_code': 200,
          'http.target': '/users/42?foo=bar',
          'sentry.kind': 'server',
          'sentry.op': 'http.server',
          'sentry.origin': 'auto.http.server',
          'sentry.segment.name.source': 'url',
          [URL_FULL]: expect.stringMatching(/\/users\/42\?foo=bar$/),
          [URL_PATH]: '/users/42',
          [SERVER_ADDRESS]: '127.0.0.1',
          [SERVER_PORT]: expect.any(Number),
          [NETWORK_LOCAL_ADDRESS]: '127.0.0.1',
          [NETWORK_LOCAL_PORT]: expect.any(Number),
          [CLIENT_ADDRESS]: '127.0.0.1',
          [CLIENT_PORT]: expect.any(Number),
          [NETWORK_PEER_ADDRESS]: '127.0.0.1',
          [NETWORK_PEER_PORT]: expect.any(Number),
          [NETWORK_PROTOCOL_NAME]: 'http',
          [NETWORK_PROTOCOL_VERSION]: '1.1',
          [NETWORK_TRANSPORT]: 'tcp',
        }),
      }),
    );
  });

  it('prefers the forwarded client over the socket for `client.address`', async () => {
    server = http.createServer((_req, res) => res.end('ok'));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    instrument(true);

    await makeRequest('/users/42', 'GET', { 'X-Forwarded-For': '203.0.113.7, 198.51.100.1' });
    const transaction = await waitForTransaction();

    expect(transaction.contexts?.trace?.data).toEqual(
      expect.objectContaining({
        // the originating client, as reported by the outermost proxy
        [CLIENT_ADDRESS]: '203.0.113.7',
        // the immediate peer stays the socket, i.e. the proxy itself
        [NETWORK_PEER_ADDRESS]: '127.0.0.1',
      }),
    );
  });

  it('does not report a forwarded client address when userInfo collection is disabled', async () => {
    client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1, dataCollection: { userInfo: false } }));
    const originalSendEvent = client.sendEvent.bind(client);
    client.sendEvent = (event, hint) => {
      events.push(event);
      return originalSendEvent(event, hint);
    };
    setCurrentClient(client);
    client.init();
    getIsolationScope().setClient(client);

    server = http.createServer((_req, res) => res.end('ok'));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    instrument(true);

    await makeRequest('/users/42', 'GET', { 'X-Forwarded-For': '203.0.113.7' });
    const transaction = await waitForTransaction();

    const data = transaction.contexts?.trace?.data;
    expect(data).not.toHaveProperty(CLIENT_ADDRESS);
    expect(data).not.toHaveProperty(NETWORK_PEER_ADDRESS);
    // the deprecated alias of `client.address` carries the same IP, so it has to be gated too
    expect(data).not.toHaveProperty('http.client_ip');
  });

  it('reports the forwarded client address on the deprecated `http.client_ip` alias too', async () => {
    server = http.createServer((_req, res) => res.end('ok'));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    instrument(true);

    await makeRequest('/users/42', 'GET', { 'X-Forwarded-For': '203.0.113.7, 198.51.100.1' });
    const transaction = await waitForTransaction();

    expect(transaction.contexts?.trace?.data).toEqual(expect.objectContaining({ 'http.client_ip': '203.0.113.7' }));
  });

  // `http.target` is the deprecated alias of `url.full` and carries the same query string, so it has to
  // respect `dataCollection.urlQueryParams` too.
  it('filters sensitive query params in `http.target` and `url.full`', async () => {
    server = http.createServer((_req, res) => res.end('ok'));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    instrument(true);

    await makeRequest('/users/42?token=abc123&foo=bar');
    const transaction = await waitForTransaction();

    expect(transaction.contexts?.trace?.data).toEqual(
      expect.objectContaining({
        'http.target': '/users/42?token=[Filtered]&foo=bar',
        [URL_FULL]: expect.stringMatching(/\/users\/42\?token=\[Filtered\]&foo=bar$/),
        [URL_PATH]: '/users/42',
      }),
    );
  });

  it('reports a 500 status with internal_error span status', async () => {
    server = http.createServer((_req, res) => {
      res.statusCode = 500;
      res.end('boom');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));

    instrument(true);

    await makeRequest('/broken');
    const transaction = await waitForTransaction();

    expect(transaction.contexts?.trace?.status).toBe('internal_error');
    expect(transaction.contexts?.trace?.data).toEqual(expect.objectContaining({ 'http.response.status_code': 500 }));
  });

  it('does not create a root span when spans: false', async () => {
    server = http.createServer((_req, res) => res.end('ok'));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    instrument(false);

    await makeRequest('/no-span');
    await new Promise(resolve => setImmediate(resolve));

    expect(events.find(e => e.type === 'transaction')).toBeUndefined();
  });

  it('skips span creation for HEAD requests', async () => {
    server = http.createServer((_req, res) => res.end());
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    instrument(true);

    await makeRequest('/anything', 'HEAD');
    await new Promise(resolve => setImmediate(resolve));

    expect(events.find(e => e.type === 'transaction')).toBeUndefined();
  });

  it('skips span creation for OPTIONS requests', async () => {
    server = http.createServer((_req, res) => res.end());
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    instrument(true);

    await makeRequest('/anything', 'OPTIONS');
    await new Promise(resolve => setImmediate(resolve));

    expect(events.find(e => e.type === 'transaction')).toBeUndefined();
  });

  it('skips span creation for static assets by default', async () => {
    server = http.createServer((_req, res) => res.end());
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    instrument(true);

    await makeRequest('/favicon.ico');
    await new Promise(resolve => setImmediate(resolve));

    expect(events.find(e => e.type === 'transaction')).toBeUndefined();
  });

  it('creates a span for static assets when ignoreStaticAssets is false', async () => {
    server = http.createServer((_req, res) => res.end());
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    instrument(true, { ignoreStaticAssets: false });

    await makeRequest('/favicon.ico');
    const transaction = await waitForTransaction();

    expect(transaction.transaction).toBe('GET /favicon.ico');
  });

  it('re-evaluates the spans default per request based on the current client', async () => {
    // Swap in a no-tracing client. The default-from-client decision must be
    // reactive: instrumentation registered before this swap should still
    // observe tracing as disabled now.
    const noTracingClient = new TestClient(getDefaultTestClientOptions({}));
    const originalSendEvent = noTracingClient.sendEvent.bind(noTracingClient);
    noTracingClient.sendEvent = (event, hint) => {
      events.push(event);
      return originalSendEvent(event, hint);
    };
    setCurrentClient(noTracingClient);
    noTracingClient.init();
    getIsolationScope().setClient(noTracingClient);

    server = http.createServer((_req, res) => res.end('ok'));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));

    // Note: no explicit `spans` — relies on the per-request default.
    const { [HTTP_ON_SERVER_REQUEST]: onServerRequest } = getHttpServerSubscriptions({});
    onServerRequest({ server }, HTTP_ON_SERVER_REQUEST);

    await makeRequest('/no-trace');
    await new Promise(resolve => setImmediate(resolve));
    expect(events.find(e => e.type === 'transaction')).toBeUndefined();

    // Now swap in a client with tracing on. The next request should produce a
    // transaction without re-running getHttpServerSubscriptions.
    setCurrentClient(client);
    getIsolationScope().setClient(client);

    await makeRequest('/now-traced');
    const transaction = await waitForTransaction();
    expect(transaction.transaction).toBe('GET /now-traced');
  });
});
