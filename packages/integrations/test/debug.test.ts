import type { EventProcessor, Integration } from '@sentry/types';

import { Debug } from '../src/debug';

const mockGetCurrentHub = (getIntegrationResult: Integration) => ({
  getIntegration: jest.fn(() => getIntegrationResult),
});

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

    const captureEventProcessor = (eventProcessor: EventProcessor) => {
      const testEvent = { event_id: 'some event' };
      void eventProcessor(testEvent, {});
      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      expect(mockConsoleLog).toBeCalledWith(testEvent);
    };

    debugIntegration.setupOnce(captureEventProcessor, () => mockGetCurrentHub(debugIntegration) as any);
  });

  it('logs an event hint if available', () => {
    const debugIntegration = new Debug();

    const captureEventProcessor = (eventProcessor: EventProcessor) => {
      const testEvent = { event_id: 'some event' };
      const testEventHint = { event_id: 'some event hint' };
      void eventProcessor(testEvent, testEventHint);
      expect(mockConsoleLog).toHaveBeenCalledTimes(2);
      expect(mockConsoleLog).toBeCalledWith(testEvent);
      expect(mockConsoleLog).toBeCalledWith(testEventHint);
    };

    debugIntegration.setupOnce(captureEventProcessor, () => mockGetCurrentHub(debugIntegration) as any);
  });

  it('logs events in stringified format when `stringify` option was set', () => {
    const debugIntegration = new Debug({ stringify: true });

    const captureEventProcessor = (eventProcessor: EventProcessor) => {
      const testEvent = { event_id: 'some event' };
      void eventProcessor(testEvent, {});
      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      expect(mockConsoleLog).toBeCalledWith(JSON.stringify(testEvent, null, 2));
    };

    debugIntegration.setupOnce(captureEventProcessor, () => mockGetCurrentHub(debugIntegration) as any);
  });

  it('logs event hints in stringified format when `stringify` option was set', () => {
    const debugIntegration = new Debug({ stringify: true });

    const captureEventProcessor = (eventProcessor: EventProcessor) => {
      const testEvent = { event_id: 'some event' };
      const testEventHint = { event_id: 'some event hint' };
      void eventProcessor(testEvent, testEventHint);
      expect(mockConsoleLog).toHaveBeenCalledTimes(2);
      expect(mockConsoleLog).toBeCalledWith(JSON.stringify(testEventHint, null, 2));
    };

    debugIntegration.setupOnce(captureEventProcessor, () => mockGetCurrentHub(debugIntegration) as any);
  });
});
