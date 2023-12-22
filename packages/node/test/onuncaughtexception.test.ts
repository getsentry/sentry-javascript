import * as SentryCore from '@sentry/core';
import type { NodeClient } from '../src/client';

import { OnUncaughtException, makeErrorHandler } from '../src/integrations/onuncaughtexception';

const client = {
  getOptions: () => ({}),
  close: () => Promise.resolve(true),
} as unknown as NodeClient;

jest.mock('@sentry/core', () => {
  // we just want to short-circuit it, so dont worry about types
  const original = jest.requireActual('@sentry/core');
  return {
    ...original,
    getClient: () => client,
  };
});

describe('uncaught exceptions', () => {
  test('install global listener', () => {
    const integration = new OnUncaughtException();
    integration.setup(client);
    expect(process.listeners('uncaughtException')).toHaveLength(1);
  });

  test('makeErrorHandler', () => {
    const captureExceptionMock = jest.spyOn(SentryCore, 'captureException');
    const handler = makeErrorHandler(client, {
      exitEvenIfOtherHandlersAreRegistered: true,
      onFatalError: () => {},
    });

    handler({ message: 'message', name: 'name' });

    expect(captureExceptionMock.mock.calls[0][1]).toEqual({
      originalException: {
        message: 'message',
        name: 'name',
      },
      captureContext: {
        level: 'fatal',
      },
      mechanism: {
        handled: false,
        type: 'onuncaughtexception',
      },
    });
  });
});
