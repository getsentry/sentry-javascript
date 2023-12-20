/* eslint-disable @typescript-eslint/unbound-method */

import * as SentryCore from '@sentry/core';
import type { Client, ConsoleLevel, Event } from '@sentry/types';
import {
  CONSOLE_LEVELS,
  GLOBAL_OBJ,
  addConsoleInstrumentationHandler,
  originalConsoleMethods,
  resetInstrumentationHandlers,
} from '@sentry/utils';

import { CaptureConsole } from '../src/captureconsole';

const mockConsole: { [key in ConsoleLevel]: jest.Mock<any> } = {
  debug: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  assert: jest.fn(),
  info: jest.fn(),
  trace: jest.fn(),
};

describe('CaptureConsole setup', () => {
  // Ensure we've initialized the instrumentation so we can get the original one
  addConsoleInstrumentationHandler(() => {});
  const _originalConsoleMethods = Object.assign({}, originalConsoleMethods);

  let mockClient: Client;

  const mockScope = {
    setExtra: jest.fn(),
    addEventProcessor: jest.fn(),
  };

  const captureMessage = jest.fn();
  const captureException = jest.fn();
  const withScope = jest.fn(callback => {
    return callback(mockScope);
  });

  beforeEach(() => {
    mockClient = {} as Client;

    jest.spyOn(SentryCore, 'captureMessage').mockImplementation(captureMessage);
    jest.spyOn(SentryCore, 'captureException').mockImplementation(captureException);
    jest.spyOn(SentryCore, 'getClient').mockImplementation(() => mockClient);
    jest.spyOn(SentryCore, 'withScope').mockImplementation(withScope);

    CONSOLE_LEVELS.forEach(key => {
      originalConsoleMethods[key] = mockConsole[key];
    });
  });

  afterEach(() => {
    jest.clearAllMocks();

    CONSOLE_LEVELS.forEach(key => {
      originalConsoleMethods[key] = _originalConsoleMethods[key];
    });

    resetInstrumentationHandlers();
  });

  describe('monkeypatching', () => {
    it('should patch user-configured console levels', () => {
      const captureConsoleIntegration = new CaptureConsole({ levels: ['log', 'warn'] });
      captureConsoleIntegration.setup(mockClient);

      GLOBAL_OBJ.console.error('msg 1');
      GLOBAL_OBJ.console.log('msg 2');
      GLOBAL_OBJ.console.warn('msg 3');

      expect(captureMessage).toHaveBeenCalledTimes(2);
    });

    it('should fall back to default console levels if none are provided', () => {
      const captureConsoleIntegration = new CaptureConsole();
      captureConsoleIntegration.setup(mockClient);

      // Assert has a special handling
      (['debug', 'info', 'warn', 'error', 'log', 'trace'] as const).forEach(key => {
        GLOBAL_OBJ.console[key]('msg');
      });

      GLOBAL_OBJ.console.assert(false);

      expect(captureMessage).toHaveBeenCalledTimes(7);
    });

    it('should not wrap any functions with an empty levels option', () => {
      const captureConsoleIntegration = new CaptureConsole({ levels: [] });
      captureConsoleIntegration.setup(mockClient);

      CONSOLE_LEVELS.forEach(key => {
        GLOBAL_OBJ.console[key]('msg');
      });

      expect(captureMessage).toHaveBeenCalledTimes(0);
    });
  });

  it('setup should fail gracefully when console is not available', () => {
    const consoleRef = GLOBAL_OBJ.console;
    // @ts-expect-error remove console
    delete GLOBAL_OBJ.console;

    const captureConsoleIntegration = new CaptureConsole();
    expect(() => {
      captureConsoleIntegration.setup(mockClient);
    }).not.toThrow();

    // reinstate initial console
    GLOBAL_OBJ.console = consoleRef;
  });

  it('should send empty arguments as extra data', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['log'] });
    captureConsoleIntegration.setup(mockClient);

    GLOBAL_OBJ.console.log();

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith('', { extra: { arguments: [] }, level: 'log' });
  });

  it('should add an event processor that sets the `logger` field of events', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['log'] });
    captureConsoleIntegration.setup(mockClient);

    // call a wrapped function
    GLOBAL_OBJ.console.log('some message');

    expect(mockScope.addEventProcessor).toHaveBeenCalledTimes(1);

    const addedEventProcessor = (mockScope.addEventProcessor as jest.Mock).mock.calls[0][0];
    const someEvent: Event = {};
    addedEventProcessor(someEvent);

    expect(someEvent.logger).toBe('console');
  });

  it('should capture message on a failed assertion', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['assert'] });
    captureConsoleIntegration.setup(mockClient);

    GLOBAL_OBJ.console.assert(1 + 1 === 3);

    expect(mockScope.setExtra).toHaveBeenLastCalledWith('arguments', []);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith('Assertion failed: console.assert', {
      extra: { arguments: [false] },
      level: 'log',
    });
  });

  it('should capture correct message on a failed assertion with message', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['assert'] });
    captureConsoleIntegration.setup(mockClient);

    GLOBAL_OBJ.console.assert(1 + 1 === 3, 'expression is false');

    expect(mockScope.setExtra).toHaveBeenLastCalledWith('arguments', ['expression is false']);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith('Assertion failed: expression is false', {
      extra: { arguments: [false, 'expression is false'] },
      level: 'log',
    });
  });

  it('should not capture message on a successful assertion', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['assert'] });
    captureConsoleIntegration.setup(mockClient);

    GLOBAL_OBJ.console.assert(1 + 1 === 2);
  });

  it('should capture exception when console logs an error object with level set to "error"', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['error'] });
    captureConsoleIntegration.setup(mockClient);

    const someError = new Error('some error');
    GLOBAL_OBJ.console.error(someError);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(someError, {
      extra: { arguments: [someError] },
      level: 'error',
    });
  });

  it('should capture exception on `console.error` when no levels are provided in constructor', () => {
    const captureConsoleIntegration = new CaptureConsole();
    captureConsoleIntegration.setup(mockClient);

    const someError = new Error('some error');
    GLOBAL_OBJ.console.error(someError);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(someError, {
      extra: { arguments: [someError] },
      level: 'error',
    });
  });

  it('should capture exception when console logs an error object in any of the args when level set to "error"', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['error'] });
    captureConsoleIntegration.setup(mockClient);

    const someError = new Error('some error');
    GLOBAL_OBJ.console.error('Something went wrong', someError);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(someError, {
      extra: { arguments: ['Something went wrong', someError] },
      level: 'error',
    });
  });

  it('should capture message on `console.log` when no levels are provided in constructor', () => {
    const captureConsoleIntegration = new CaptureConsole();
    captureConsoleIntegration.setup(mockClient);

    GLOBAL_OBJ.console.error('some message');

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith('some message', {
      extra: { arguments: ['some message'] },
      level: 'error',
    });
  });

  it('should capture message when console logs a non-error object with level set to "error"', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['error'] });
    captureConsoleIntegration.setup(mockClient);

    GLOBAL_OBJ.console.error('some non-error message');

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith('some non-error message', {
      extra: { arguments: ['some non-error message'] },
      level: 'error',
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('should capture a message for non-error log levels', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['info'] });
    captureConsoleIntegration.setup(mockClient);

    GLOBAL_OBJ.console.info('some message');

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith('some message', {
      extra: { arguments: ['some message'] },
      level: 'info',
    });
  });

  it('should call the original console function when console members are called', () => {
    // Mock console log to test if it was called
    const originalConsoleLog = GLOBAL_OBJ.console.log;
    const mockConsoleLog = jest.fn();
    GLOBAL_OBJ.console.log = mockConsoleLog;

    const captureConsoleIntegration = new CaptureConsole({ levels: ['log'] });
    captureConsoleIntegration.setup(mockClient);

    GLOBAL_OBJ.console.log('some message 1', 'some message 2');

    expect(mockConsoleLog).toHaveBeenCalledTimes(1);
    expect(mockConsoleLog).toHaveBeenCalledWith('some message 1', 'some message 2');

    // Reset console log
    GLOBAL_OBJ.console.log = originalConsoleLog;
  });

  it('should not wrap any levels that are not members of console', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['log', 'someNonExistingLevel', 'error'] });
    captureConsoleIntegration.setup(mockClient);

    // The provided level should not be created
    expect((GLOBAL_OBJ.console as any)['someNonExistingLevel']).toBeUndefined();
  });

  it('should wrap the console when the client does not have a registered captureconsole integration, but not capture any messages', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['log', 'error'] });
    // when `setup` is not called on the current client, it will not trigger
    captureConsoleIntegration.setup({} as Client);

    // Should not capture messages
    GLOBAL_OBJ.console.log('some message');
    expect(captureMessage).not.toHaveBeenCalledWith();
  });

  it("should not crash when the original console methods don't exist at time of invocation", () => {
    originalConsoleMethods.log = undefined;

    const captureConsoleIntegration = new CaptureConsole({ levels: ['log'] });
    captureConsoleIntegration.setup(mockClient);

    expect(() => {
      GLOBAL_OBJ.console.log('some message');
    }).not.toThrow();
  });

  it("marks captured exception's mechanism as unhandled", () => {
    // const addExceptionMechanismSpy = jest.spyOn(utils, 'addExceptionMechanism');

    const captureConsoleIntegration = new CaptureConsole({ levels: ['error'] });
    captureConsoleIntegration.setup(mockClient);

    const someError = new Error('some error');
    GLOBAL_OBJ.console.error(someError);

    const addedEventProcessor = (mockScope.addEventProcessor as jest.Mock).mock.calls[0][0];
    const someEvent: Event = {
      exception: {
        values: [{}],
      },
    };
    addedEventProcessor(someEvent);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(mockScope.addEventProcessor).toHaveBeenCalledTimes(1);

    expect(someEvent.exception?.values?.[0].mechanism).toEqual({
      handled: false,
      type: 'console',
    });
  });
});
