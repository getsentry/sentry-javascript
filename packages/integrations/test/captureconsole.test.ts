/* eslint-disable @typescript-eslint/unbound-method */
import type { Event, Hub, Integration } from '@sentry/types';
import type { ConsoleLevel } from '@sentry/utils';
import {
  addInstrumentationHandler,
  CONSOLE_LEVELS,
  GLOBAL_OBJ,
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

function getMockHub(integration: Integration): Hub {
  const mockScope = {
    setLevel: jest.fn(),
    setExtra: jest.fn(),
    addEventProcessor: jest.fn(),
  };

  const mockHub = {
    withScope: jest.fn(callback => {
      callback(mockScope);
    }),
    captureMessage: jest.fn(),
    captureException: jest.fn(),
    getScope: jest.fn(() => mockScope),
  };

  return {
    ...mockHub,
    getIntegration: jest.fn(() => integration),
  } as unknown as Hub;
}

describe('CaptureConsole setup', () => {
  // Ensure we've initialized the instrumentation so we can get the original one
  addInstrumentationHandler('console', () => {});
  const _originalConsoleMethods = Object.assign({}, originalConsoleMethods);

  beforeEach(() => {
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
      const mockHub = getMockHub(captureConsoleIntegration);
      captureConsoleIntegration.setupOnce(
        () => undefined,
        () => mockHub,
      );

      GLOBAL_OBJ.console.error('msg 1');
      GLOBAL_OBJ.console.log('msg 2');
      GLOBAL_OBJ.console.warn('msg 3');

      expect(mockHub.captureMessage).toHaveBeenCalledTimes(2);
    });

    it('should fall back to default console levels if none are provided', () => {
      const captureConsoleIntegration = new CaptureConsole();
      const mockHub = getMockHub(captureConsoleIntegration);
      captureConsoleIntegration.setupOnce(
        () => undefined,
        () => mockHub,
      );

      // Assert has a special handling
      (['debug', 'info', 'warn', 'error', 'log', 'trace'] as const).forEach(key => {
        GLOBAL_OBJ.console[key]('msg');
      });

      GLOBAL_OBJ.console.assert(false);

      expect(mockHub.captureMessage).toHaveBeenCalledTimes(7);
    });

    it('should not wrap any functions with an empty levels option', () => {
      const captureConsoleIntegration = new CaptureConsole({ levels: [] });
      const mockHub = getMockHub(captureConsoleIntegration);
      captureConsoleIntegration.setupOnce(
        () => undefined,
        () => mockHub,
      );

      CONSOLE_LEVELS.forEach(key => {
        GLOBAL_OBJ.console[key]('msg');
      });

      expect(mockHub.captureMessage).toHaveBeenCalledTimes(0);
    });
  });

  it('setup should fail gracefully when console is not available', () => {
    const consoleRef = GLOBAL_OBJ.console;
    // @ts-ignore remove console
    delete GLOBAL_OBJ.console;

    const captureConsoleIntegration = new CaptureConsole();
    const mockHub = getMockHub(captureConsoleIntegration);
    expect(() => {
      captureConsoleIntegration.setupOnce(
        () => undefined,
        () => mockHub,
      );
    }).not.toThrow();

    // reinstate initial console
    GLOBAL_OBJ.console = consoleRef;
  });

  it('should set a level in the scope when console function is called', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['error'] });
    const mockHub = getMockHub(captureConsoleIntegration);
    captureConsoleIntegration.setupOnce(
      () => undefined,
      () => mockHub,
    );

    const mockScope = mockHub.getScope();

    // call a wrapped function
    GLOBAL_OBJ.console.error('some logging message');

    expect(mockScope.setLevel).toHaveBeenCalledTimes(1);
    expect(mockScope.setLevel).toHaveBeenCalledWith('error');
  });

  it('should send arguments as extra data', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['log'] });
    const mockHub = getMockHub(captureConsoleIntegration);
    captureConsoleIntegration.setupOnce(
      () => undefined,
      () => mockHub,
    );

    const mockScope = mockHub.getScope();

    GLOBAL_OBJ.console.log('some arg 1', 'some arg 2');

    expect(mockScope.setExtra).toHaveBeenCalledTimes(1);
    expect(mockScope.setExtra).toHaveBeenCalledWith('arguments', ['some arg 1', 'some arg 2']);
  });

  it('should send empty arguments as extra data', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['log'] });
    const mockHub = getMockHub(captureConsoleIntegration);
    captureConsoleIntegration.setupOnce(
      () => undefined,
      () => mockHub,
    );

    const mockScope = mockHub.getScope();

    GLOBAL_OBJ.console.log();

    expect(mockScope.setExtra).toHaveBeenCalledTimes(1);
    expect(mockScope.setExtra).toHaveBeenCalledWith('arguments', []);
  });

  it('should add an event processor that sets the `logger` field of events', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['log'] });
    const mockHub = getMockHub(captureConsoleIntegration);
    captureConsoleIntegration.setupOnce(
      () => undefined,
      () => mockHub,
    );

    const mockScope = mockHub.getScope();

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
    const mockHub = getMockHub(captureConsoleIntegration);
    captureConsoleIntegration.setupOnce(
      () => undefined,
      () => mockHub,
    );

    const mockScope = mockHub.getScope();

    GLOBAL_OBJ.console.assert(1 + 1 === 3);

    expect(mockScope.setExtra).toHaveBeenLastCalledWith('arguments', []);
    expect(mockHub.captureMessage).toHaveBeenCalledTimes(1);
    expect(mockHub.captureMessage).toHaveBeenCalledWith('Assertion failed: console.assert');
  });

  it('should capture correct message on a failed assertion with message', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['assert'] });
    const mockHub = getMockHub(captureConsoleIntegration);
    captureConsoleIntegration.setupOnce(
      () => undefined,
      () => mockHub,
    );

    const mockScope = mockHub.getScope();

    GLOBAL_OBJ.console.assert(1 + 1 === 3, 'expression is false');

    expect(mockScope.setExtra).toHaveBeenLastCalledWith('arguments', ['expression is false']);
    expect(mockHub.captureMessage).toHaveBeenCalledTimes(1);
    expect(mockHub.captureMessage).toHaveBeenCalledWith('Assertion failed: expression is false');
  });

  it('should not capture message on a successful assertion', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['assert'] });
    const mockHub = getMockHub(captureConsoleIntegration);
    captureConsoleIntegration.setupOnce(
      () => undefined,
      () => mockHub,
    );

    GLOBAL_OBJ.console.assert(1 + 1 === 2);
  });

  it('should capture exception when console logs an error object with level set to "error"', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['error'] });
    const mockHub = getMockHub(captureConsoleIntegration);
    captureConsoleIntegration.setupOnce(
      () => undefined,
      () => mockHub,
    );

    const someError = new Error('some error');
    GLOBAL_OBJ.console.error(someError);

    expect(mockHub.captureException).toHaveBeenCalledTimes(1);
    expect(mockHub.captureException).toHaveBeenCalledWith(someError);
  });

  it('should capture exception on `console.error` when no levels are provided in constructor', () => {
    const captureConsoleIntegration = new CaptureConsole();
    const mockHub = getMockHub(captureConsoleIntegration);
    captureConsoleIntegration.setupOnce(
      () => undefined,
      () => mockHub,
    );

    const someError = new Error('some error');
    GLOBAL_OBJ.console.error(someError);

    expect(mockHub.captureException).toHaveBeenCalledTimes(1);
    expect(mockHub.captureException).toHaveBeenCalledWith(someError);
  });

  it('should capture exception when console logs an error object in any of the args when level set to "error"', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['error'] });
    const mockHub = getMockHub(captureConsoleIntegration);
    captureConsoleIntegration.setupOnce(
      () => undefined,
      () => mockHub,
    );

    const someError = new Error('some error');
    GLOBAL_OBJ.console.error('Something went wrong', someError);

    expect(mockHub.captureException).toHaveBeenCalledTimes(1);
    expect(mockHub.captureException).toHaveBeenCalledWith(someError);
  });

  it('should capture message on `console.log` when no levels are provided in constructor', () => {
    const captureConsoleIntegration = new CaptureConsole();
    const mockHub = getMockHub(captureConsoleIntegration);
    captureConsoleIntegration.setupOnce(
      () => undefined,
      () => mockHub,
    );

    GLOBAL_OBJ.console.error('some message');

    expect(mockHub.captureMessage).toHaveBeenCalledTimes(1);
    expect(mockHub.captureMessage).toHaveBeenCalledWith('some message');
  });

  it('should capture message when console logs a non-error object with level set to "error"', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['error'] });
    const mockHub = getMockHub(captureConsoleIntegration);
    captureConsoleIntegration.setupOnce(
      () => undefined,
      () => mockHub,
    );

    GLOBAL_OBJ.console.error('some non-error message');

    expect(mockHub.captureMessage).toHaveBeenCalledTimes(1);
    expect(mockHub.captureMessage).toHaveBeenCalledWith('some non-error message');
    expect(mockHub.captureException).not.toHaveBeenCalled();
  });

  it('should capture a message for non-error log levels', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['info'] });
    const mockHub = getMockHub(captureConsoleIntegration);
    captureConsoleIntegration.setupOnce(
      () => undefined,
      () => mockHub,
    );

    GLOBAL_OBJ.console.info('some message');

    expect(mockHub.captureMessage).toHaveBeenCalledTimes(1);
    expect(mockHub.captureMessage).toHaveBeenCalledWith('some message');
  });

  it('should call the original console function when console members are called', () => {
    // Mock console log to test if it was called
    const originalConsoleLog = GLOBAL_OBJ.console.log;
    const mockConsoleLog = jest.fn();
    GLOBAL_OBJ.console.log = mockConsoleLog;

    const captureConsoleIntegration = new CaptureConsole({ levels: ['log'] });
    const mockHub = getMockHub(captureConsoleIntegration);
    captureConsoleIntegration.setupOnce(
      () => undefined,
      () => mockHub,
    );

    GLOBAL_OBJ.console.log('some message 1', 'some message 2');

    expect(mockConsoleLog).toHaveBeenCalledTimes(1);
    expect(mockConsoleLog).toHaveBeenCalledWith('some message 1', 'some message 2');

    // Reset console log
    GLOBAL_OBJ.console.log = originalConsoleLog;
  });

  it('should not wrap any levels that are not members of console', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['log', 'someNonExistingLevel', 'error'] });
    const mockHub = getMockHub(captureConsoleIntegration);
    captureConsoleIntegration.setupOnce(
      () => undefined,
      () => mockHub,
    );

    // The provided level should not be created
    expect((GLOBAL_OBJ.console as any)['someNonExistingLevel']).toBeUndefined();
  });

  it('should wrap the console when the client does not have a registered captureconsole integration, but not capture any messages', () => {
    const captureConsoleIntegration = new CaptureConsole({ levels: ['log', 'error'] });
    const mockHub = getMockHub(null as any); // simulate not having the integration registered
    captureConsoleIntegration.setupOnce(
      () => undefined,
      () => mockHub,
    );

    // Should not capture messages
    GLOBAL_OBJ.console.log('some message');
    expect(mockHub.captureMessage).not.toHaveBeenCalledWith();
  });

  it("should not crash when the original console methods don't exist at time of invocation", () => {
    originalConsoleMethods.log = undefined;

    const captureConsoleIntegration = new CaptureConsole({ levels: ['log'] });
    const mockHub = getMockHub(captureConsoleIntegration);
    captureConsoleIntegration.setupOnce(
      () => undefined,
      () => mockHub,
    );

    expect(() => {
      GLOBAL_OBJ.console.log('some message');
    }).not.toThrow();
  });
});
