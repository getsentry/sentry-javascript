import type { Client, Event, EventHint, Hub, Integration } from '@sentry/types';

import { Debug } from '../src/debug';

function testEventLogged(integration: Integration, testEvent?: Event, testEventHint?: EventHint) {
  const callbacks: ((event: Event, hint?: EventHint) => void)[] = [];

  const client: Client = {
    on(hook: string, callback: (event: Event, hint?: EventHint) => void) {
      expect(hook).toEqual('beforeSendEvent');
      callbacks.push(callback);
    },
  } as Client;

  function getCurrentHub() {
    return {
      getClient: jest.fn(() => {
        return client;
      }),
    } as unknown as Hub;
  }

  integration.setupOnce(() => {}, getCurrentHub);

  expect(callbacks.length).toEqual(1);

  if (testEvent) {
    callbacks[0](testEvent, testEventHint);
  }
}

// Replace console log with a mock so we can check for invocations
const mockConsoleLog = jest.fn();
// eslint-disable-next-line @typescript-eslint/unbound-method
const originalConsoleLog = global.console.log;
global.console.log = mockConsoleLog;

describe('Debug integration setup should register an event processor that', () => {
  afterAll(() => {
    // Reset mocked console log to original one
    global.console.log = originalConsoleLog;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('logs an event', () => {
    const debugIntegration = new Debug();
    const testEvent = { event_id: 'some event' };

    testEventLogged(debugIntegration, testEvent);

    expect(mockConsoleLog).toHaveBeenCalledTimes(1);
    expect(mockConsoleLog).toHaveBeenCalledWith(testEvent);
  });

  it('logs an event hint if available', () => {
    const debugIntegration = new Debug();

    const testEvent = { event_id: 'some event' };
    const testEventHint = { event_id: 'some event hint' };

    testEventLogged(debugIntegration, testEvent, testEventHint);

    expect(mockConsoleLog).toHaveBeenCalledTimes(2);
    expect(mockConsoleLog).toHaveBeenCalledWith(testEvent);
    expect(mockConsoleLog).toHaveBeenCalledWith(testEventHint);
  });

  it('logs events in stringified format when `stringify` option was set', () => {
    const debugIntegration = new Debug({ stringify: true });
    const testEvent = { event_id: 'some event' };

    testEventLogged(debugIntegration, testEvent);

    expect(mockConsoleLog).toHaveBeenCalledTimes(1);
    expect(mockConsoleLog).toHaveBeenCalledWith(JSON.stringify(testEvent, null, 2));
  });

  it('logs event hints in stringified format when `stringify` option was set', () => {
    const debugIntegration = new Debug({ stringify: true });

    const testEvent = { event_id: 'some event' };
    const testEventHint = { event_id: 'some event hint' };

    testEventLogged(debugIntegration, testEvent, testEventHint);

    expect(mockConsoleLog).toHaveBeenCalledTimes(2);
    expect(mockConsoleLog).toHaveBeenCalledWith(JSON.stringify(testEventHint, null, 2));
  });
});
