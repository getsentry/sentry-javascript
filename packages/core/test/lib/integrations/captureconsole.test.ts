/* eslint-disable @typescript-eslint/unbound-method */

import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { Client } from '../../../src';
import * as CurrentScopes from '../../../src/currentScopes';
import * as SentryCore from '../../../src/exports';
import { addConsoleInstrumentationHandler } from '../../../src/instrument/console';
import { resetInstrumentationHandlers } from '../../../src/instrument/handlers';
import { captureConsoleIntegration } from '../../../src/integrations/captureconsole';
import type { Event } from '../../../src/types-hoist/event';
import type { ConsoleLevel } from '../../../src/types-hoist/instrument';
import { CONSOLE_LEVELS, originalConsoleMethods } from '../../../src/utils/debug-logger';
import { GLOBAL_OBJ } from '../../../src/utils/worldwide';

const mockConsole: { [key in ConsoleLevel]: Mock<any> } = {
  debug: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  assert: vi.fn(),
  info: vi.fn(),
  trace: vi.fn(),
};

describe('CaptureConsole setup', () => {
  // Ensure we've initialized the instrumentation so we can get the original one
  addConsoleInstrumentationHandler(() => {});
  const _originalConsoleMethods = Object.assign({}, originalConsoleMethods);

  let mockClient: Client;

  const captureException = vi.fn();

  const mockScope = {
    setExtra: vi.fn(),
    addEventProcessor: vi.fn(),
    captureMessage: vi.fn(),
  };

  const withScope = vi.fn(callback => {
    return callback(mockScope);
  });

  beforeEach(() => {
    mockClient = {} as Client;

    vi.spyOn(SentryCore, 'captureException').mockImplementation(captureException);
    vi.spyOn(CurrentScopes, 'getClient').mockImplementation(() => mockClient);
    vi.spyOn(CurrentScopes, 'withScope').mockImplementation(withScope);

    CONSOLE_LEVELS.forEach(key => {
      originalConsoleMethods[key] = mockConsole[key];
    });
  });

  afterEach(() => {
    vi.clearAllMocks();

    CONSOLE_LEVELS.forEach(key => {
      originalConsoleMethods[key] = _originalConsoleMethods[key];
    });

    resetInstrumentationHandlers();
  });

  describe('monkeypatching', () => {
    it('should patch user-configured console levels', () => {
      const captureConsole = captureConsoleIntegration({ levels: ['log', 'warn'] });
      captureConsole.setup?.(mockClient);

      GLOBAL_OBJ.console.error('msg 1');
      GLOBAL_OBJ.console.log('msg 2');
      GLOBAL_OBJ.console.warn('msg 3');

      expect(mockScope.captureMessage).toHaveBeenCalledTimes(2);
    });

    it('should fall back to default console levels if none are provided', () => {
      const captureConsole = captureConsoleIntegration();
      captureConsole.setup?.(mockClient);

      // Assert has a special handling
      (['debug', 'info', 'warn', 'error', 'log', 'trace'] as const).forEach(key => {
        GLOBAL_OBJ.console[key]('msg');
      });

      GLOBAL_OBJ.console.assert(false);

      expect(mockScope.captureMessage).toHaveBeenCalledTimes(7);
    });

    it('should not wrap any functions with an empty levels option', () => {
      const captureConsole = captureConsoleIntegration({ levels: [] });
      captureConsole.setup?.(mockClient);

      CONSOLE_LEVELS.forEach(key => {
        GLOBAL_OBJ.console[key]('msg');
      });

      expect(mockScope.captureMessage).toHaveBeenCalledTimes(0);
    });
  });

  it('setup should fail gracefully when console is not available', () => {
    const consoleRef = GLOBAL_OBJ.console;
    // @ts-expect-error remove console
    delete GLOBAL_OBJ.console;

    const captureConsole = captureConsoleIntegration();
    expect(() => {
      captureConsole.setup?.(mockClient);
    }).not.toThrow();

    // reinstate initial console
    GLOBAL_OBJ.console = consoleRef;
  });

  it('should send empty arguments as extra data', () => {
    const captureConsole = captureConsoleIntegration({ levels: ['log'] });
    captureConsole.setup?.(mockClient);

    GLOBAL_OBJ.console.log();

    expect(mockScope.captureMessage).toHaveBeenCalledTimes(1);
    expect(mockScope.captureMessage).toHaveBeenCalledWith('', 'log', {
      captureContext: {
        level: 'log',
        extra: { arguments: [] },
      },
      syntheticException: expect.any(Error),
    });
  });

  it('should add an event processor that sets the `debug` field of events', () => {
    const captureConsole = captureConsoleIntegration({ levels: ['log'] });
    captureConsole.setup?.(mockClient);

    // call a wrapped function
    GLOBAL_OBJ.console.log('some message');

    expect(mockScope.addEventProcessor).toHaveBeenCalledTimes(1);

    const addedEventProcessor = mockScope.addEventProcessor.mock.calls[0]?.[0];
    const someEvent: Event = {};
    addedEventProcessor(someEvent);

    expect(someEvent.logger).toBe('console');
  });

  it('should capture message on a failed assertion', () => {
    const captureConsole = captureConsoleIntegration({ levels: ['assert'] });
    captureConsole.setup?.(mockClient);

    GLOBAL_OBJ.console.assert(1 + 1 === 3);

    expect(mockScope.setExtra).toHaveBeenLastCalledWith('arguments', []);
    expect(mockScope.captureMessage).toHaveBeenCalledTimes(1);
    expect(mockScope.captureMessage).toHaveBeenCalledWith('Assertion failed: console.assert', 'log', {
      captureContext: {
        level: 'log',
        extra: { arguments: [false] },
      },
      syntheticException: expect.any(Error),
    });
  });

  it('should capture correct message on a failed assertion with message', () => {
    const captureConsole = captureConsoleIntegration({ levels: ['assert'] });
    captureConsole.setup?.(mockClient);

    GLOBAL_OBJ.console.assert(1 + 1 === 3, 'expression is false');

    expect(mockScope.setExtra).toHaveBeenLastCalledWith('arguments', ['expression is false']);
    expect(mockScope.captureMessage).toHaveBeenCalledTimes(1);
    expect(mockScope.captureMessage).toHaveBeenCalledWith('Assertion failed: expression is false', 'log', {
      captureContext: {
        level: 'log',
        extra: { arguments: [false, 'expression is false'] },
      },
      syntheticException: expect.any(Error),
    });
  });

  it('should not capture message on a successful assertion', () => {
    const captureConsole = captureConsoleIntegration({ levels: ['assert'] });
    captureConsole.setup?.(mockClient);

    GLOBAL_OBJ.console.assert(1 + 1 === 2);

    expect(mockScope.captureMessage).toHaveBeenCalledTimes(0);
  });

  it('should capture exception when console logs an error object with level set to "error"', () => {
    const captureConsole = captureConsoleIntegration({ levels: ['error'] });
    captureConsole.setup?.(mockClient);

    const someError = new Error('some error');
    GLOBAL_OBJ.console.error(someError);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(someError, {
      extra: { arguments: [someError] },
      level: 'error',
    });
  });

  it('should capture exception on `console.error` when no levels are provided in constructor', () => {
    const captureConsole = captureConsoleIntegration();
    captureConsole.setup?.(mockClient);

    const someError = new Error('some error');
    GLOBAL_OBJ.console.error(someError);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(someError, {
      extra: { arguments: [someError] },
      level: 'error',
    });
  });

  it('should capture exception when console logs an error object in any of the args when level set to "error"', () => {
    const captureConsole = captureConsoleIntegration({ levels: ['error'] });
    captureConsole.setup?.(mockClient);

    const someError = new Error('some error');
    GLOBAL_OBJ.console.error('Something went wrong', someError);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(someError, {
      extra: { arguments: ['Something went wrong', someError] },
      level: 'error',
    });
  });

  it('should capture message on `console.log` when no levels are provided in constructor', () => {
    const captureConsole = captureConsoleIntegration();
    captureConsole.setup?.(mockClient);

    GLOBAL_OBJ.console.error('some message');

    expect(mockScope.captureMessage).toHaveBeenCalledTimes(1);
    expect(mockScope.captureMessage).toHaveBeenCalledWith('some message', 'error', {
      captureContext: {
        level: 'error',
        extra: { arguments: ['some message'] },
      },
      syntheticException: expect.any(Error),
    });
  });

  it('should capture message when console logs a non-error object with level set to "error"', () => {
    const captureConsole = captureConsoleIntegration({ levels: ['error'] });
    captureConsole.setup?.(mockClient);

    GLOBAL_OBJ.console.error('some non-error message');

    expect(mockScope.captureMessage).toHaveBeenCalledTimes(1);
    expect(mockScope.captureMessage).toHaveBeenCalledWith('some non-error message', 'error', {
      captureContext: {
        level: 'error',
        extra: { arguments: ['some non-error message'] },
      },
      syntheticException: expect.any(Error),
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('should capture a message for non-error log levels', () => {
    const captureConsole = captureConsoleIntegration({ levels: ['info'] });
    captureConsole.setup?.(mockClient);

    GLOBAL_OBJ.console.info('some message');

    expect(mockScope.captureMessage).toHaveBeenCalledTimes(1);
    expect(mockScope.captureMessage).toHaveBeenCalledWith('some message', 'info', {
      captureContext: {
        level: 'info',
        extra: { arguments: ['some message'] },
      },
      syntheticException: expect.any(Error),
    });
  });

  it('should call the original console function when console members are called', () => {
    // Mock console log to test if it was called
    const originalConsoleLog = GLOBAL_OBJ.console.log;
    const mockConsoleLog = vi.fn();
    GLOBAL_OBJ.console.log = mockConsoleLog;

    const captureConsole = captureConsoleIntegration({ levels: ['log'] });
    captureConsole.setup?.(mockClient);

    GLOBAL_OBJ.console.log('some message 1', 'some message 2');

    expect(mockConsoleLog).toHaveBeenCalledTimes(1);
    expect(mockConsoleLog).toHaveBeenCalledWith('some message 1', 'some message 2');

    // Reset console log
    GLOBAL_OBJ.console.log = originalConsoleLog;
  });

  it('should not wrap any levels that are not members of console', () => {
    const captureConsole = captureConsoleIntegration({ levels: ['log', 'someNonExistingLevel', 'error'] });
    captureConsole.setup?.(mockClient);

    // The provided level should not be created
    expect((GLOBAL_OBJ.console as any)['someNonExistingLevel']).toBeUndefined();
  });

  it('should wrap the console when the client does not have a registered captureconsole integration, but not capture any messages', () => {
    const captureConsole = captureConsoleIntegration({ levels: ['log', 'error'] });
    // when `setup` is not called on the current client, it will not trigger
    captureConsole.setup?.({} as Client);

    // Should not capture messages
    GLOBAL_OBJ.console.log('some message');
    expect(mockScope.captureMessage).not.toHaveBeenCalledWith();
  });

  it("should not crash when the original console methods don't exist at time of invocation", () => {
    originalConsoleMethods.log = undefined;

    const captureConsole = captureConsoleIntegration({ levels: ['log'] });
    captureConsole.setup?.(mockClient);

    expect(() => {
      GLOBAL_OBJ.console.log('some message');
    }).not.toThrow();
  });

  describe('exception mechanism', () => {
    it("marks captured exception's mechanism as handled by default", () => {
      const captureConsole = captureConsoleIntegration({ levels: ['error'] });
      captureConsole.setup?.(mockClient);

      const someError = new Error('some error');
      GLOBAL_OBJ.console.error(someError);

      const addedEventProcessor = mockScope.addEventProcessor.mock.calls[0]?.[0];
      const someEvent: Event = {
        exception: {
          values: [{}],
        },
      };
      addedEventProcessor(someEvent);

      expect(captureException).toHaveBeenCalledTimes(1);
      expect(mockScope.addEventProcessor).toHaveBeenCalledTimes(1);

      expect(someEvent.exception?.values?.[0]?.mechanism).toEqual({
        handled: true,
        type: 'auto.core.capture_console',
      });
    });

    it("marks captured exception's mechanism as handled if set in the options", () => {
      const captureConsole = captureConsoleIntegration({ levels: ['error'], handled: true });
      captureConsole.setup?.(mockClient);

      const someError = new Error('some error');
      GLOBAL_OBJ.console.error(someError);

      const addedEventProcessor = mockScope.addEventProcessor.mock.calls[0]?.[0];
      const someEvent: Event = {
        exception: {
          values: [{}],
        },
      };
      addedEventProcessor(someEvent);

      expect(captureException).toHaveBeenCalledTimes(1);
      expect(mockScope.addEventProcessor).toHaveBeenCalledTimes(1);

      expect(someEvent.exception?.values?.[0]?.mechanism).toEqual({
        handled: true,
        type: 'auto.core.capture_console',
      });
    });

    it("marks captured exception's mechanism as unhandled if set in the options", () => {
      const captureConsole = captureConsoleIntegration({ levels: ['error'], handled: false });
      captureConsole.setup?.(mockClient);

      const someError = new Error('some error');
      GLOBAL_OBJ.console.error(someError);

      const addedEventProcessor = mockScope.addEventProcessor.mock.calls[0]?.[0];
      const someEvent: Event = {
        exception: {
          values: [{}],
        },
      };
      addedEventProcessor(someEvent);

      expect(captureException).toHaveBeenCalledTimes(1);
      expect(mockScope.addEventProcessor).toHaveBeenCalledTimes(1);

      expect(someEvent.exception?.values?.[0]?.mechanism).toEqual({
        handled: false,
        type: 'auto.core.capture_console',
      });
    });
  });
});
