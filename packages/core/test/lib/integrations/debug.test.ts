import type { Client, Event, EventHint } from '@sentry/types';

import { debugIntegration } from '../../../src/integrations/debug';

function testEventLogged(
  integration: ReturnType<typeof debugIntegration>,
  testEvent?: Event,
  testEventHint?: EventHint,
) {
  const callbacks: ((event: Event, hint?: EventHint) => void)[] = [];

  const client: Client = {
    on(hook: string, callback: (event: Event, hint?: EventHint) => void) {
      expect(hook).toEqual('beforeSendEvent');
      callbacks.push(callback);
    },
  } as Client;

  integration.setup?.(client);

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
    const debug = debugIntegration();
    const testEvent = { event_id: 'some event' };

    testEventLogged(debug, testEvent);

    expect(mockConsoleLog).toHaveBeenCalledTimes(1);
    expect(mockConsoleLog).toBeCalledWith(testEvent);
  });

  it('logs an event hint if available', () => {
    const debug = debugIntegration();

    const testEvent = { event_id: 'some event' };
    const testEventHint = { event_id: 'some event hint' };

    testEventLogged(debug, testEvent, testEventHint);

    expect(mockConsoleLog).toHaveBeenCalledTimes(2);
    expect(mockConsoleLog).toBeCalledWith(testEvent);
    expect(mockConsoleLog).toBeCalledWith(testEventHint);
  });

  it('logs events in stringified format when `stringify` option was set', () => {
    const debug = debugIntegration({ stringify: true });
    const testEvent = { event_id: 'some event' };

    testEventLogged(debug, testEvent);

    expect(mockConsoleLog).toHaveBeenCalledTimes(1);
    expect(mockConsoleLog).toBeCalledWith(JSON.stringify(testEvent, null, 2));
  });

  it('logs event hints in stringified format when `stringify` option was set', () => {
    const debug = debugIntegration({ stringify: true });

    const testEvent = { event_id: 'some event' };
    const testEventHint = { event_id: 'some event hint' };

    testEventLogged(debug, testEvent, testEventHint);

    expect(mockConsoleLog).toHaveBeenCalledTimes(2);
    expect(mockConsoleLog).toBeCalledWith(JSON.stringify(testEventHint, null, 2));
  });
});
