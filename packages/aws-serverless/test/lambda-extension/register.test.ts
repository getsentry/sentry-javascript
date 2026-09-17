import { text } from 'node:stream/consumers';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AwsLambdaExtension } from '../../src/lambda-extension/aws-lambda-extension';
import { MAX_REPORTED_FAILURES, POLL_GIVE_UP_MS } from '../../src/lambda-extension/constants';
import { collapseEveryDeadline, type FakeExtensionsApi, pollNotExpected, startExtensionsApi } from './helpers';

/** Long enough for a collapsed deadline to fire; the slowest measured took about 10ms. */
const REGISTER_DEADLINE_GRACE_MS = 50;

describe('AwsLambdaExtension.register', () => {
  let api: FakeExtensionsApi | undefined;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await api?.close();
    api = undefined;
    delete process.env.AWS_LAMBDA_RUNTIME_API;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('subscribes to SHUTDOWN alone, keeping the extension out of the invocation gate', async () => {
    // An INVOKE subscription joins the gate that holds every invocation until each subscriber has
    // asked for the next event, so a poll that dies mid-flight would hold the rest of the
    // environment's invocations open until the function timeout — and Lambda Managed Instances
    // refuses the subscription outright, failing the function's init with it.
    let body: unknown;
    api = await startExtensionsApi(pollNotExpected, (req, res) => {
      void text(req).then(raw => {
        body = JSON.parse(raw);
        res.writeHead(200, { 'lambda-extension-identifier': 'test-extension-id' });
        res.end('{}');
      });
    });

    await new AwsLambdaExtension().register();

    expect(body).toEqual({ events: ['SHUTDOWN'] });
  });

  test('retries a registration the API never answered, instead of abandoning the extension', async () => {
    // Lambda gates the init phase on every extension it launched, so one that never registers holds
    // each invocation open until the function timeout without the handler ever running.
    let attempts = 0;
    api = await startExtensionsApi(pollNotExpected, (_req, res, attempt) => {
      attempts = attempt;

      // The first attempt never gets an answer at all, which is the only retryable shape.
      if (attempt === 1) {
        res.socket?.destroy();
        return;
      }

      res.writeHead(200, { 'lambda-extension-identifier': 'late-id' });
      res.end('{}');
    });
    const extension = new AwsLambdaExtension();

    await extension.register();

    expect(attempts).toBe(2);
    // A transport failure is the one shape worth retrying, and it is what carries a `code`.
    expect(errorSpy).toHaveBeenCalledWith(
      'Sentry Lambda extension: registering with the Extensions API failed, retrying.',
      expect.objectContaining({ code: 'ECONNRESET' }),
    );
  });

  test('polls with the identifier from the attempt that finally succeeded', async () => {
    let polledWith: string | undefined;
    api = await startExtensionsApi(
      (req, res) => {
        polledWith = req.headers['lambda-extension-identifier'] as string | undefined;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ eventType: 'SHUTDOWN' }));
      },
      (_req, res, attempt) => {
        if (attempt === 1) {
          res.socket?.destroy();
          return;
        }

        res.writeHead(200, { 'lambda-extension-identifier': 'late-id' });
        res.end('{}');
      },
    );
    const extension = new AwsLambdaExtension();
    await extension.register();

    await extension.next();

    expect(polledWith).toBe('late-id');
  });

  test.each([
    ['a 200 that carries no identifier', 200, '{}', 'without returning an identifier'],
    ['a 403', 403, 'already registered', 'Failed to register with the extension API: already registered'],
    ['a 400', 400, 'bad request', 'Failed to register with the extension API: bad request'],
    ['a 500', 500, 'container error', 'Failed to register with the extension API: container error'],
  ])('does not re-register after %s, which the API answered', async (_label, status, body, message) => {
    // The body is a compile-time constant, so no answered refusal can start working. Retrying one
    // holds the init gate with the handler never running; surfacing costs one fast invocation and
    // lets Lambda recycle into an environment that works.
    let attempts = 0;
    api = await startExtensionsApi(pollNotExpected, (_req, res, attempt) => {
      attempts = attempt;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(body);
    });

    await expect(new AwsLambdaExtension().register()).rejects.toThrow(message);

    expect(attempts).toBe(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test('gives up on a registration that never lands, so Lambda can recycle', async () => {
    // Retrying forever holds the init phase, and with it every invocation, for as long as it keeps
    // trying — the same harm `main` exits on when a poll is never accepted, reached through the
    // registration door. Past the ceiling it is better to crash.
    const extension = new AwsLambdaExtension();
    const refused = new Error('ECONNREFUSED');
    // The loop is what is under test, so the request is stubbed rather than driven over a socket.
    const attempt = vi
      .spyOn(extension as unknown as { _requestRegistration: () => Promise<string> }, '_requestRegistration')
      .mockRejectedValue(refused);

    vi.useFakeTimers();
    const registering = expect(extension.register()).rejects.toThrow('ECONNREFUSED');
    await vi.advanceTimersByTimeAsync(POLL_GIVE_UP_MS + 60_000);
    await registering;

    // It kept trying for the whole window, and stopped reporting long before it stopped trying.
    expect(attempt.mock.calls.length).toBeGreaterThan(MAX_REPORTED_FAILURES);
    expect(errorSpy).toHaveBeenCalledTimes(MAX_REPORTED_FAILURES);
  });

  test('holds the registration open rather than putting a deadline on it', async () => {
    // Measured against the real Extensions API: undici's 300s `headersTimeout` abandoned a POST
    // RAPID had already honoured, the retry was refused `Extension.InvalidExtensionState`, and the
    // extension exited. Asserting that one timeout API went unused would have missed it, so every
    // deadline the call can arm is collapsed instead.
    let release: (() => void) | undefined;
    let reached!: () => void;
    const reachedServer = new Promise<void>(resolve => (reached = resolve));
    api = await startExtensionsApi(pollNotExpected, (_req, res) => {
      release = () => {
        res.writeHead(200, { 'lambda-extension-identifier': 'test-extension-id' });
        res.end('{}');
      };
      reached();
    });

    collapseEveryDeadline();

    let settlement: string | undefined;
    const registering = new AwsLambdaExtension().register().then(
      () => (settlement = 'registered'),
      (err: Error) => (settlement = `rejected with ${err.message}`),
    );

    await reachedServer;
    await delay(REGISTER_DEADLINE_GRACE_MS);

    expect(settlement).toBeUndefined();

    release?.();
    await registering;
    // Spelled out rather than "settled": a rejection would satisfy "it stopped waiting" too, and
    // this test exists because an abandoned registration is what the API refuses forever after.
    expect(settlement).toBe('registered');
  });

  test('sends the extension name Lambda requires, which is the wrapper filename', async () => {
    // Lambda matches the registered name against the file it launched from `/opt/extensions/`, so
    // this string is wire contract with `src/lambda-extension/sentry-extension`, not a label.
    let name: string | undefined;
    api = await startExtensionsApi(pollNotExpected, (req, res) => {
      name = req.headers['lambda-extension-name'] as string | undefined;
      res.writeHead(200, { 'lambda-extension-identifier': 'test-extension-id' });
      res.end('{}');
    });

    await new AwsLambdaExtension().register();

    expect(name).toBe('sentry-extension');
  });

  test('puts no deadline on the registration, which cannot be made twice', async () => {
    // A deadline cannot rescue a wedged API; it can only abandon a POST the API has already
    // committed, and every attempt after that is refused for the life of the environment.
    const deadline = vi.spyOn(AbortSignal, 'timeout');
    api = await startExtensionsApi(pollNotExpected);

    await new AwsLambdaExtension().register();

    expect(deadline).not.toHaveBeenCalled();
  });
});
