import { channel } from 'node:diagnostics_channel';
import type * as SentryCore from '@sentry/core';
import { remixV3Channels } from '@sentry/server-utils/orchestrion/config';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const captureException = vi.fn();

// Only `captureException` is replaced; the middleware needs the rest for real.
vi.mock('@sentry/core', async importOriginal => ({
  ...(await importOriginal<typeof SentryCore>()),
  captureException: (...args: unknown[]) => captureException(...args),
}));

const { instrumentRemixV3 } = await import('../../src/v3/server/instrument');

const startChannel = channel(`tracing:${remixV3Channels.REMIX_V3_CREATE_ROUTER}:start`);
const listenerStartChannel = channel(`tracing:${remixV3Channels.REMIX_V3_CREATE_REQUEST_LISTENER}:start`);

/** What orchestrion's transform publishes: the call's arguments, collected into a real array. */
function publishCreateRouter(args: unknown[]): void {
  startChannel.publish({ arguments: args });
}

function publishCreateRequestListener(args: unknown[]): void {
  listenerStartChannel.publish({ arguments: args });
}

describe('instrumentRemixV3', () => {
  beforeAll(() => {
    // Called twice on purpose: the `--import` entry and `setupOnce()` both call it, and a second set
    // of channel handlers would inject the middleware twice.
    instrumentRemixV3();
    instrumentRemixV3();
  });

  it('prepends the middleware and supplies a matcher', () => {
    const appMiddleware = (): Response => new Response();
    const options: Record<string, unknown> = { middleware: [appMiddleware] };

    publishCreateRouter([options]);

    expect(options.middleware).toEqual([expect.any(Function), appMiddleware]);
    expect(options.matcher).toEqual(
      expect.objectContaining({ add: expect.any(Function), matchAll: expect.any(Function) }),
    );
  });

  it('creates the options object when createRouter is called with no arguments', () => {
    const args: unknown[] = [];

    publishCreateRouter(args);

    expect(args[0]).toEqual(expect.objectContaining({ middleware: [expect.any(Function)] }));
  });

  it('keeps a matcher the app supplied', () => {
    const appMatcher = { add: () => {}, matchAll: () => [] };
    const options: Record<string, unknown> = { matcher: appMatcher };

    publishCreateRouter([options]);

    expect(options.matcher).toBe(appMatcher);
  });

  it('leaves an options object it cannot write to alone, without crashing the app', async () => {
    // Node rethrows an exception from a channel subscriber as an uncaught exception, so an unguarded
    // write here would take down an app that runs fine without Sentry.
    const uncaught: Error[] = [];
    const onUncaught = (error: Error): void => void uncaught.push(error);
    process.on('uncaughtException', onUncaught);

    const options = Object.freeze({ middleware: [] });

    try {
      publishCreateRouter([options]);
      await new Promise(resolve => setImmediate(resolve));
    } finally {
      process.off('uncaughtException', onUncaught);
    }

    expect(uncaught).toEqual([]);
    expect(options.middleware).toEqual([]);
  });
});

describe('the createRequestListener error hook', () => {
  beforeAll(() => {
    instrumentRemixV3();
  });

  beforeEach(() => {
    captureException.mockClear();
  });

  it("captures and then calls the app's own onError", async () => {
    const appResponse = new Response('handled', { status: 500 });
    const appOnError = vi.fn(() => appResponse);
    const options: Record<string, unknown> = { onError: appOnError };

    publishCreateRequestListener([() => new Response(), options]);
    const error = new Error('boom');
    const returned = await (options.onError as (e: unknown) => Promise<Response>)(error);

    expect(captureException).toHaveBeenCalledWith(error, {
      mechanism: { handled: false, type: 'auto.http.remix_v3.on_error' },
    });
    expect(appOnError).toHaveBeenCalledWith(error);
    expect(returned).toBe(appResponse);
  });

  it('keeps the default console logging when the app passed no onError', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const args: unknown[] = [() => new Response()];

    publishCreateRequestListener(args);
    const error = new Error('boom');
    const returned = await (args[1] as { onError: (e: unknown) => unknown }).onError(error);

    expect(captureException).toHaveBeenCalledWith(error, {
      mechanism: { handled: false, type: 'auto.http.remix_v3.on_error' },
    });
    // What the listener's own default handler does, which the hook replaced.
    expect(consoleError).toHaveBeenCalledWith(error);
    expect(returned).toBeUndefined();
    consoleError.mockRestore();
  });

  it('installs a hook when the app passed no options at all', () => {
    const args: unknown[] = [() => new Response()];

    publishCreateRequestListener(args);

    expect(args[1]).toEqual(expect.objectContaining({ onError: expect.any(Function) }));
  });
});
