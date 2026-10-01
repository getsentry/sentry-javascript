import { channel } from 'node:diagnostics_channel';
import { remixV3Channels } from '@sentry/server-utils/orchestrion/config';
import { beforeAll, describe, expect, it } from 'vitest';

import { instrumentRemixV3 } from '../../src/v3/server/instrument';

const startChannel = channel(`tracing:${remixV3Channels.REMIX_V3_CREATE_ROUTER}:start`);

/** What orchestrion's transform publishes: the call's arguments, collected into a real array. */
function publishCreateRouter(args: unknown[]): void {
  startChannel.publish({ arguments: args });
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
