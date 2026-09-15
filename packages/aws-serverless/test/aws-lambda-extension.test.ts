import * as http from 'node:http';
import * as net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  AwsLambdaExtension,
  ExtensionsApiError,
  getSentryDSNFromEnv,
  request,
} from '../src/lambda-extension/aws-lambda-extension';

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

/**
 * Stands in for the Lambda Extensions API. `/register` always succeeds so tests can reach the
 * poll; everything else is delegated so each test decides how `/event/next` behaves.
 */
async function startExtensionsApi(
  onNext: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    if (req.url?.endsWith('/register')) {
      res.writeHead(200, { 'lambda-extension-identifier': 'test-extension-id' });
      res.end('{}');
      return;
    }

    onNext(req, res);
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.AWS_LAMBDA_RUNTIME_API = `127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    close: () =>
      new Promise<void>(resolve => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

describe('AwsLambdaExtension.next', () => {
  let api: { close: () => Promise<void> } | undefined;

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

    const error = await extension.next().catch((err: Error) => err);

    expect(error.message).toBe('Failed to advance to next event: extension not registered');
    expect((error as { statusCode?: number }).statusCode).toBe(403);
  });

  test('rejects a 200 whose body is not the event JSON', async () => {
    // Returning an empty event here would look like an INVOKE to `run`: backoff reset, no
    // sleep, immediate re-poll — a tight silent loop, and the SHUTDOWN exit never taken.
    api = await startExtensionsApi((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('<html>not json</html>');
    });
    const extension = new AwsLambdaExtension();
    await extension.register();

    await expect(extension.next()).rejects.toThrow('Failed to parse the event from the Extensions API');
  });

  test('rejects registration that returns no extension identifier', async () => {
    // Left unchecked this yields a null id, and every later poll throws synchronously.
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    process.env.AWS_LAMBDA_RUNTIME_API = `127.0.0.1:${(server.address() as AddressInfo).port}`;
    api = { close: () => new Promise<void>(resolve => server.close(() => resolve())) };

    await expect(new AwsLambdaExtension().register()).rejects.toThrow('without returning an extension identifier');
  });
});

type PolledEvent = { eventType?: string };

/**
 * Drives `run` through a fixed sequence of polls. Anything past the script rejects with a
 * client error, which `run` treats as fatal — so a regression that stops honouring SHUTDOWN
 * fails in milliseconds instead of spinning the worker until it runs out of heap.
 */
function scriptPolls(extension: AwsLambdaExtension, script: Array<PolledEvent | Error>) {
  let poll = 0;

  return vi.spyOn(extension, 'next').mockImplementation(async () => {
    const step = script[poll++];

    if (step === undefined) {
      throw new ExtensionsApiError(`unexpected poll #${poll}`, 400);
    }
    if (step instanceof Error) {
      throw step;
    }
    return step;
  });
}

describe('AwsLambdaExtension.run', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('keeps polling after a failed poll', async () => {
    // Lambda holds an invocation open until every registered extension asks for the next
    // event, so a loop that exits on the first rejection leaves later invocations to be
    // killed by the function timeout with no error reported anywhere.
    const extension = new AwsLambdaExtension();
    const next = scriptPolls(extension, [
      new Error('socket hang up'),
      { eventType: 'INVOKE' },
      { eventType: 'SHUTDOWN' },
    ]);

    await extension.run();

    expect(next).toHaveBeenCalledTimes(3);
  });

  test('reports a failed poll on the console, which the debug logger cannot do here', async () => {
    const extension = new AwsLambdaExtension();
    const pollFailure = new Error('socket hang up');
    scriptPolls(extension, [pollFailure, { eventType: 'SHUTDOWN' }]);

    await extension.run();

    expect(errorSpy).toHaveBeenCalledWith(
      'Sentry Lambda extension: polling the Extensions API failed, retrying.',
      pollFailure,
    );
  });

  test('retries a 408 and a 429 rather than treating them as unrecoverable', async () => {
    // These are the two 4xx that do start working again; routing them into the fatal path
    // would exit the process over a transient hiccup.
    const extension = new AwsLambdaExtension();
    const next = scriptPolls(extension, [
      new ExtensionsApiError('request timeout', 408),
      new ExtensionsApiError('too many requests', 429),
      { eventType: 'SHUTDOWN' },
    ]);

    await extension.run();

    expect(next).toHaveBeenCalledTimes(3);
  });

  test('gives up once a retryable failure stops recovering', async () => {
    // Without a cap this writes one console error every 5s for as long as the environment is
    // thawed, for a condition that is never going to clear. The backoff makes 20 attempts take
    // over a minute of real time, hence the fake clock.
    vi.useFakeTimers();
    try {
      const extension = new AwsLambdaExtension();
      const next = vi.spyOn(extension, 'next').mockRejectedValue(new Error('ECONNREFUSED'));

      const running = expect(extension.run()).rejects.toThrow('ECONNREFUSED');
      await vi.advanceTimersByTimeAsync(120_000);
      await running;

      expect(next).toHaveBeenCalledTimes(20);
    } finally {
      vi.useRealTimers();
    }
  });

  test('stops on SHUTDOWN instead of polling a runtime API that is being torn down', async () => {
    // Polling after SHUTDOWN only produces failures on the way out, and the retry path would
    // write one console error per attempt on every execution environment teardown.
    const extension = new AwsLambdaExtension();
    const next = scriptPolls(extension, [{ eventType: 'SHUTDOWN' }]);

    await extension.run();

    expect(next).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('AwsLambdaExtension.run — unrecoverable poll', () => {
  let api: { close: () => Promise<void> } | undefined;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await api?.close();
    api = undefined;
    delete process.env.AWS_LAMBDA_RUNTIME_API;
    vi.restoreAllMocks();
  });

  test('gives up on a client error rather than retrying it forever', async () => {
    // Retrying a rejected registration never recovers; it just buries the reason under a
    // console error every few seconds for the life of the execution environment.
    api = await startExtensionsApi((_req, res) => {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end('extension not registered');
    });
    const extension = new AwsLambdaExtension();
    await extension.register();

    await expect(extension.run()).rejects.toThrow('extension not registered');
  });
});

describe('request', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('rejects when the peer goes away mid-poll', async () => {
    // The poll has no deadline on purpose — it spans the environment's frozen idle time, which
    // is unbounded — so a peer that disappears has to surface as a socket error instead.
    const server = http.createServer();
    server.on('connection', socket => socket.destroy());
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

    await expect(request(url, {})).rejects.toThrow();

    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  test('enables TCP keep-alive so a dead peer is detected without a deadline', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200);
      res.end('{}');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    const setKeepAlive = vi.spyOn(net.Socket.prototype, 'setKeepAlive');

    await request(url, {});

    expect(setKeepAlive).toHaveBeenCalledWith(true, 30_000);

    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
});
