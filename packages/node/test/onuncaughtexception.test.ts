import { Hub } from '@sentry/hub';

import { OnUncaughtException } from '../src/integrations/onuncaughtexception';

jest.mock('@sentry/hub', () => {
  // we just want to short-circuit it, so dont worry about types
  const original = jest.requireActual('@sentry/hub');
  original.Hub.prototype.getIntegration = () => true;
  return {
    ...original,
    getCurrentHub: () => new Hub(),
  };
});

describe('uncaught exceptions', () => {
  test('install global listener', () => {
    const integration = new OnUncaughtException();
    integration.setupOnce();
    expect(process.listeners('uncaughtException')).toHaveLength(1);
  });

  test('sendUncaughtException', () => {
    const integration = new OnUncaughtException({ onFatalError: jest.fn() });
    integration.setupOnce();

    const captureException = jest.spyOn(Hub.prototype, 'captureException');

    integration.handler({ message: 'message', name: 'name' });

    expect(captureException.mock.calls[0][1]?.data).toEqual({
      mechanism: { handled: false, type: 'onuncaughtexception' },
    });
  });
});
