import { afterEach, describe, expect, test, vi } from 'vitest';
import { AwsLambdaExtension } from '../../src/lambda-extension/aws-lambda-extension';
import { type FakeExtensionsApi, startExtensionsApi } from './helpers';

describe('AwsLambdaExtension.next', () => {
  let api: FakeExtensionsApi | undefined;

  afterEach(async () => {
    await api?.close();
    api = undefined;
    delete process.env.AWS_LAMBDA_RUNTIME_API;
    vi.restoreAllMocks();
  });

  test("does not poll through fetch, which would cap the poll at undici's 300s headersTimeout", async () => {
    api = await startExtensionsApi((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ eventType: 'INVOKE' }));
    });
    const extension = new AwsLambdaExtension();
    await extension.register();

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await extension.next();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('polls the Extensions API path Lambda serves, which is wire contract', async () => {
    let polledPath: string | undefined;
    api = await startExtensionsApi((req, res) => {
      polledPath = req.url;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ eventType: 'INVOKE' }));
    });
    const extension = new AwsLambdaExtension();
    await extension.register();

    await extension.next();

    expect(polledPath).toBe('/2020-01-01/extension/event/next');
  });

  test('resolves for an event that arrives long after the request was issued', async () => {
    api = await startExtensionsApi((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ eventType: 'INVOKE' }));
      }, 300);
    });
    const extension = new AwsLambdaExtension();
    await extension.register();

    await expect(extension.next()).resolves.toEqual({ eventType: 'INVOKE' });
  });

  test('rejects with the response body and status when the Extensions API refuses the poll', async () => {
    api = await startExtensionsApi((_req, res) => {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end('extension not registered');
    });
    const extension = new AwsLambdaExtension();
    await extension.register();

    await expect(extension.next()).rejects.toThrow('Failed to advance to next event: extension not registered');
    await expect(extension.next()).rejects.toHaveProperty('statusCode', 403);
  });

  // `run` decides when to stop from `eventType`, so a 200 without one has to count as a failed
  // poll. `JSON.parse` succeeds for every JSON literal and `{}` is an object, so anything short of
  // an `eventType` string would otherwise read as an INVOKE: counters reset, no backoff, re-poll.
  test.each([
    ['an empty object', '{}'],
    ['a JSON null', 'null'],
    ['a JSON number', '123'],
    ['a JSON array', '[]'],
    ['a JSON boolean', 'true'],
    ['a body that is not JSON at all', '<html>not json</html>'],
  ])('rejects a 200 carrying %s rather than reading it as an event', async (_shape, body) => {
    api = await startExtensionsApi((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
    });
    const extension = new AwsLambdaExtension();
    await extension.register();

    await expect(extension.next()).rejects.toThrow(`The Extensions API returned no event: ${body}`);
  });
});
