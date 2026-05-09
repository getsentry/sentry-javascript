import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getIsolationScope } from '../../../../src/currentScopes';
import { setCurrentClient } from '../../../../src/sdk';
import { HTTP_ON_SERVER_REQUEST } from '../../../../src/integrations/http/constants';
import { getHttpServerSubscriptions } from '../../../../src/integrations/http/server-subscription';
import type { Event } from '../../../../src/types-hoist/event';
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

  async function makeRequest(path: string, method: 'GET' | 'HEAD' = 'GET'): Promise<void> {
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
          headers: { Connection: 'close' },
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
          'http.route': '/users/42',
          'http.response.status_code': 200,
          'http.status_code': 200,
          'http.target': '/users/42?foo=bar',
          'otel.kind': 'SERVER',
          'sentry.op': 'http.server',
          'sentry.origin': 'auto.http.server',
          'sentry.source': 'url',
        }),
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
