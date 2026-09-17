import type * as http from 'node:http';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AwsLambdaExtension } from '../../src/lambda-extension/aws-lambda-extension';
import { ExtensionsApiError } from '../../src/lambda-extension/errors';
import { main } from '../../src/lambda-extension/main';

describe('main', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exit: ReturnType<typeof vi.fn>;
  let extension: AwsLambdaExtension;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exit = vi.fn();
    extension = new AwsLambdaExtension();
    vi.spyOn(extension, 'startSentryTunnel').mockReturnValue(undefined as unknown as http.Server);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('gives back the rest of the shutdown window once the drain has returned', async () => {
    vi.spyOn(extension, 'register').mockResolvedValue(undefined);
    vi.spyOn(extension, 'run').mockResolvedValue({ reason: 'shutdown', pollAccepted: true });

    await main(extension, exit);

    expect(exit).toHaveBeenCalledWith(0);
  });

  test('exits when the registration cannot be made, so Lambda recycles the environment', async () => {
    // An extension holding a name it cannot poll with holds the init phase, and with it every
    // invocation, for the environment's whole life. This is the one failure worth crashing over.
    const refused = new Error('Failed to register with the extension API: already registered');
    vi.spyOn(extension, 'register').mockRejectedValue(refused);
    const run = vi.spyOn(extension, 'run');

    await main(extension, exit);

    expect(exit).toHaveBeenCalledWith(1);
    expect(run).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      'Sentry Lambda extension: could not register, events will not be tunnelled.',
      refused,
    );
  });

  test('stays up when polling stops, rather than failing the invocation in flight', async () => {
    // Out of the invocation gate, an extension that has stopped polling costs the customer
    // nothing; a process ending outside the shutdown phase is reported as `Extension.Crash`.
    const pollFailure = new ExtensionsApiError('refused', 403);
    vi.spyOn(extension, 'register').mockResolvedValue(undefined);
    vi.spyOn(extension, 'run').mockResolvedValue({ reason: 'unrecoverable', pollAccepted: true, error: pollFailure });

    await main(extension, exit);

    expect(exit).not.toHaveBeenCalled();
    // A tunnel that failed to listen leaves no handle, and an empty event loop exits just the same.
    expect(vi.getTimerCount()).toBe(1);
    vi.clearAllTimers();
  });

  test('starts the tunnel before registering, so envelopes are served while registration retries', async () => {
    const order: string[] = [];
    vi.mocked(extension.startSentryTunnel).mockImplementation(() => {
      order.push('tunnel');
      return undefined as unknown as http.Server;
    });
    vi.spyOn(extension, 'register').mockImplementation(async () => {
      order.push('register');
    });
    vi.spyOn(extension, 'run').mockResolvedValue({ reason: 'shutdown', pollAccepted: true });

    await main(extension, exit);

    expect(order).toEqual(['tunnel', 'register']);
  });

  test('exits when it gave up before the Extensions API ever took a poll', async () => {
    // Lambda releases the init phase on the first poll the API accepts, so giving up before then
    // leaves this extension holding every invocation to the function timeout — measured at 30,000ms
    // billed per invocation, against 1.5s for a crash that lets Lambda recycle.
    const pollFailure = new ExtensionsApiError('refused', 403);
    vi.spyOn(extension, 'register').mockResolvedValue(undefined);
    vi.spyOn(extension, 'run').mockResolvedValue({ reason: 'unrecoverable', pollAccepted: false, error: pollFailure });

    await main(extension, exit);

    expect(exit).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'Sentry Lambda extension: never started polling the Extensions API, events will not be tunnelled.',
      pollFailure,
    );
  });
});
