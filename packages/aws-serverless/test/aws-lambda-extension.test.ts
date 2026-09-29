import { once } from 'node:events';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AwsLambdaExtension, getSentryDSNFromEnv } from '../src/lambda-extension/aws-lambda-extension';

vi.mock('node:http', async () => {
  const original = await vi.importActual('node:http');
  return { ...original };
});

describe('AwsLambdaExtension.next', () => {
  let server: http.Server;
  let extension: AwsLambdaExtension;

  beforeEach(async () => {
    server = http.createServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    vi.stubEnv('AWS_LAMBDA_RUNTIME_API', `127.0.0.1:${(server.address() as AddressInfo).port}`);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { headers: { 'lambda-extension-identifier': 'test-extension-id' } }),
    );
    extension = new AwsLambdaExtension();
    await extension.register();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  test('uses timeout-free HTTP requests for successive events', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fetch headers timeout'));
    const get = vi.spyOn(http, 'get');
    const requests: Array<{ method: string | undefined; url: string | undefined; extensionId: unknown }> = [];
    server.on('request', (req, res) => {
      requests.push({ method: req.method, url: req.url, extensionId: req.headers['lambda-extension-identifier'] });
      res.end(JSON.stringify({ eventType: 'INVOKE' }));
    });

    await expect(extension.next()).resolves.toBeUndefined();
    await expect(extension.next()).resolves.toBeUndefined();

    expect(get).toHaveBeenCalledWith(
      `http://${process.env.AWS_LAMBDA_RUNTIME_API}/2020-01-01/extension/event/next`,
      {
        agent: false,
        timeout: 0,
        headers: { 'Lambda-Extension-Identifier': 'test-extension-id', 'Content-Type': 'application/json' },
      },
      expect.any(Function),
    );
    expect(requests).toEqual([
      { method: 'GET', url: '/2020-01-01/extension/event/next', extensionId: 'test-extension-id' },
      { method: 'GET', url: '/2020-01-01/extension/event/next', extensionId: 'test-extension-id' },
    ]);
  });

  test.each([403, 500])('rejects a %i response with the error body', async status => {
    server.once('request', (_req, res) => {
      res.writeHead(status);
      res.end('Extension API error');
    });

    await expect(extension.next()).rejects.toThrow('Failed to advance to next event: Extension API error');
  });

  test('rejects when the connection closes before headers arrive', async () => {
    server.once('request', req => req.socket.destroy());

    await expect(extension.next()).rejects.toThrow('socket hang up');
  });

  test('rejects when the response body is interrupted', async () => {
    server.once('request', (_req, res) => {
      res.writeHead(200, { 'Content-Length': '100' });
      res.flushHeaders();
      res.end('{');
    });

    await expect(extension.next()).rejects.toThrow();
  });

  test('rejects before registration', async () => {
    await expect(new AwsLambdaExtension().next()).rejects.toThrow('Extension ID is not set');
  });
});

describe('getSentryDSNFromEnv', () => {
  afterEach(() => {
    delete process.env.SENTRY_DSN;
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('returns undefined when SENTRY_DSN is unset', () => {
    expect(getSentryDSNFromEnv()).toEqual(undefined);
  });

  test('returns canonical dsn string when SENTRY_DSN is valid', () => {
    process.env.SENTRY_DSN = 'https://public@o1.ingest.sentry.io/1';

    expect(getSentryDSNFromEnv()).toEqual({
      protocol: 'https',
      publicKey: 'public',
      host: 'o1.ingest.sentry.io',
      projectId: '1',
      pass: '',
      path: '',
      port: '',
    });
  });

  test('returns undefined when SENTRY_DSN is invalid', () => {
    process.env.SENTRY_DSN = 'not-a-dsn';

    expect(getSentryDSNFromEnv()).toEqual(undefined);
  });
});
