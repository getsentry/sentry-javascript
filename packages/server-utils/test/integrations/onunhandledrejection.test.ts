import * as SentryCore from '@sentry/core';
import type { Client } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  makeUnhandledPromiseHandler,
  onUnhandledRejectionIntegration,
} from '../../src/integrations/onunhandledrejection';

// don't log the test errors we're going to throw, so at a quick glance it doesn't look like the test itself has failed
global.console.warn = () => null;
global.console.error = () => null;

describe('unhandled promises', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('installs a global listener', () => {
    const client = { getOptions: () => ({}) } as unknown as Client;
    SentryCore.setCurrentClient(client);

    const beforeListeners = process.listeners('unhandledRejection').length;

    const integration = onUnhandledRejectionIntegration();
    integration.setup!(client);

    expect(process.listeners('unhandledRejection').length).toBe(beforeListeners + 1);
  });

  it('passes the rejection reason (not the promise) as originalException', () => {
    const client = { getOptions: () => ({}) } as unknown as Client;
    SentryCore.setCurrentClient(client);

    const reason = new Error('boom');
    const promise = Promise.reject(reason);
    // swallow the rejection so it does not leak into the test runner
    promise.catch(() => {});

    const captureException = vi.spyOn(SentryCore, 'captureException').mockImplementation(() => 'test');

    const handler = makeUnhandledPromiseHandler(client, { mode: 'warn', ignore: [] });
    handler(reason, promise);

    expect(captureException).toHaveBeenCalledTimes(1);
    const [capturedReason, hint] = captureException.mock.calls[0]!;
    expect(capturedReason).toBe(reason);
    expect(hint?.originalException).toBe(reason);
    expect(hint?.originalException).not.toBe(promise);
    expect(hint?.mechanism).toEqual({
      handled: false,
      type: 'auto.node.onunhandledrejection',
    });
  });
});
