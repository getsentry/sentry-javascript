import { createEnvelope, getTunnelPath, serializeEnvelope, uuid4 } from '@sentry/core';
import * as http from 'node:http';
import * as http2 from 'node:http2';
import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

type Runner = ReturnType<ReturnType<typeof createRunner>['start']>;

/**
 * An event envelope as the browser SDK sends it through the tunnel, for the scenario's DSN.
 */
async function browserEnvelope(runner: Runner, message: string): Promise<{ tunnelPath: string; envelope: string }> {
  const dsn = (await runner.makeRequest<string>('get', '/dsn'))!;
  const eventId = uuid4();
  const envelope = serializeEnvelope(
    createEnvelope({ dsn, event_id: eventId, sent_at: new Date().toISOString() }, [
      [{ type: 'event' }, { event_id: eventId, message }],
    ]),
  ) as string;

  return { tunnelPath: getTunnelPath(dsn)!, envelope };
}

/**
 * POSTs to the scenario server and returns the status and body, also for error responses.
 */
async function post(runner: Runner, path: string, body: string): Promise<{ status: number; text: string }> {
  const response = await fetch(`http://localhost:${runner.getPort()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-sentry-envelope' },
    body,
  });

  return { status: response.status, text: await response.text() };
}

/**
 * POSTs a chunked body, without `Content-Length`.
 */
function postChunked(runner: Runner, path: string, body: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const request = http.request({ port: runner.getPort(), path, method: 'POST' }, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
    request.write(body.slice(0, 5));
    request.end(body.slice(5));
  });
}

/**
 * Waits for the scenario server's port, which `makeRequest` does for HTTP/1 requests.
 */
async function waitForPort(runner: Runner): Promise<number> {
  for (let i = 0; i < 200 && !runner.getPort(); i++) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return runner.getPort()!;
}

/**
 * Makes an HTTP/2 request and returns the status and body.
 */
function http2Request(
  client: http2.ClientHttp2Session,
  method: string,
  path: string,
  body?: string,
): Promise<{ status: unknown; body: string }> {
  return new Promise(resolve => {
    const request = client.request({
      ':method': method,
      ':path': path,
      ...(body && { 'content-type': 'application/x-sentry-envelope', 'content-length': Buffer.byteLength(body) }),
    });
    let status: unknown;
    let responseBody = '';
    request.on('response', headers => (status = headers[':status']));
    request.on('data', chunk => (responseBody += chunk));
    request.on('end', () => resolve({ status, body: responseBody }));
    request.end(body);
  });
}

describe('wiring the managed tunnel by hand', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('forwards from node:http with handleTunnelRequestIfMatched and leaves the rest to the app', async () => {
    const runner = createRunner(__dirname, 'http.mjs')
      .withMockSentryServer()
      .expect({ event: { message: 'via node:http' } })
      .expect({ event: { message: 'done' } })
      .start();
    const { tunnelPath, envelope } = await browserEnvelope(runner, 'via node:http');

    expect(await post(runner, tunnelPath, envelope)).toEqual({ status: 200, text: expect.any(String) });
    expect(await post(runner, '/api', envelope)).toEqual({ status: 200, text: 'app' });

    await runner.makeRequest('get', '/done');
    await runner.completed();
  });

  test('rejects a chunked upload without Content-Length with a 411 and forwards nothing', async () => {
    const runner = createRunner(__dirname, 'http.mjs')
      .withMockSentryServer()
      .expect({ event: { message: 'after the chunked upload' } })
      .expect({ event: { message: 'done' } })
      .start();
    const chunked = await browserEnvelope(runner, 'chunked upload');
    const after = await browserEnvelope(runner, 'after the chunked upload');

    expect(await postChunked(runner, chunked.tunnelPath, chunked.envelope)).toBe(411);
    expect((await post(runner, after.tunnelPath, after.envelope)).status).toBe(200);

    await runner.makeRequest('get', '/done');
    await runner.completed();
  });

  test('forwards from node:http2, whose requests carry pseudo-headers', async () => {
    const runner = createRunner(__dirname, 'http2.mjs')
      .withMockSentryServer()
      .expect({ event: { message: 'via node:http2' } })
      .expect({ event: { message: 'done' } })
      .start();
    const client = http2.connect(`http://localhost:${await waitForPort(runner)}`);

    const dsn = (await http2Request(client, 'GET', '/dsn')).body;
    const eventId = uuid4();
    const envelope = serializeEnvelope(
      createEnvelope({ dsn, event_id: eventId }, [
        [{ type: 'event' }, { event_id: eventId, message: 'via node:http2' }],
      ]),
    ) as string;

    expect((await http2Request(client, 'POST', getTunnelPath(dsn)!, envelope)).status).toBe(200);
    expect(await http2Request(client, 'POST', '/api', envelope)).toEqual({ status: 200, body: 'app' });

    await http2Request(client, 'GET', '/done');
    client.close();
    await runner.completed();
  });

  test('forwards from Express as middleware and as a route, and gets nothing to forward behind a catch-all parser', async () => {
    const runner = createRunner(__dirname, 'express.mjs')
      .withMockSentryServer()
      .expect({ event: { message: 'via express middleware' } })
      .expect({ event: { message: 'via express route' } })
      .expect({ event: { message: 'done' } })
      .start();
    const middleware = await browserEnvelope(runner, 'via express middleware');
    const route = await browserEnvelope(runner, 'via express route');
    const parsed = await browserEnvelope(runner, 'behind express.raw');

    expect((await post(runner, middleware.tunnelPath, middleware.envelope)).status).toBe(200);
    expect((await post(runner, '/parsed-tunnel', parsed.envelope)).status).toBe(400);
    expect((await post(runner, '/route-tunnel', route.envelope)).status).toBe(200);
    expect(await post(runner, '/api', route.envelope)).toEqual({ status: 200, text: 'app' });

    await runner.makeRequest('get', '/done');
    await runner.completed();
  });

  test('forwards from a Fastify onRequest hook', async () => {
    const runner = createRunner(__dirname, 'fastify.mjs')
      .withMockSentryServer()
      .expect({ event: { message: 'via fastify' } })
      .expect({ event: { message: 'done' } })
      .start();
    const { tunnelPath, envelope } = await browserEnvelope(runner, 'via fastify');

    expect((await post(runner, tunnelPath, envelope)).status).toBe(200);

    await runner.makeRequest('get', '/done');
    await runner.completed();
  });

  test('forwards from a Koa middleware', async () => {
    const runner = createRunner(__dirname, 'koa.mjs')
      .withMockSentryServer()
      .expect({ event: { message: 'via koa' } })
      .expect({ event: { message: 'done' } })
      .start();
    const { tunnelPath, envelope } = await browserEnvelope(runner, 'via koa');

    expect((await post(runner, tunnelPath, envelope)).status).toBe(200);
    expect(await post(runner, '/api', envelope)).toEqual({ status: 200, text: 'app' });

    await runner.makeRequest('get', '/done');
    await runner.completed();
  });
});
