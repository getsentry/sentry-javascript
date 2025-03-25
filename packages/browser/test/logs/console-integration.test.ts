import type { ConsoleLevel } from '@sentry/core';
import {
  GLOBAL_OBJ,
  setCurrentClient,
  addConsoleInstrumentationHandler,
  originalConsoleMethods,
  CONSOLE_LEVELS,
  resetInstrumentationHandlers,
} from '@sentry/core';
import * as captureModule from '../../src/logs/capture';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consoleLoggingIntegration } from '../../src/logs/console-integration';
import { getDefaultBrowserClientOptions } from '../helper/browser-client-options';
import { BrowserClient } from '../../src';

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

  const captureLogSpy = vi.spyOn(captureModule, 'captureLog');

  let mockClient: BrowserClient;
  beforeEach(() => {
    CONSOLE_LEVELS.forEach(key => {
      originalConsoleMethods[key] = mockConsole[key];
    });

    mockClient = new BrowserClient({
      ...getDefaultBrowserClientOptions(),
      dsn: 'https://username@domain/123',
      _experiments: {
        enableLogs: true,
      },
    });

    setCurrentClient(mockClient);
    mockClient.init();
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
      const captureConsole = consoleLoggingIntegration({ levels: ['log', 'warn'] });
      captureConsole.setup?.(mockClient);

      GLOBAL_OBJ.console.error('msg 1');
      GLOBAL_OBJ.console.log('msg 2');
      GLOBAL_OBJ.console.warn('msg 3');

      expect(captureLogSpy).toHaveBeenCalledTimes(2);
    });

    it('should fall back to default console levels if none are provided', () => {
      const captureConsole = consoleLoggingIntegration();
      captureConsole.setup?.(mockClient);

      // Assert has a special handling
      (['debug', 'info', 'warn', 'error', 'log', 'trace'] as const).forEach(key => {
        GLOBAL_OBJ.console[key]('msg');
      });

      GLOBAL_OBJ.console.assert(false);

      expect(captureLogSpy).toHaveBeenCalledTimes(7);
    });

    it('should not wrap any functions with an empty levels option', () => {
      const captureConsole = consoleLoggingIntegration({ levels: [] });
      captureConsole.setup?.(mockClient);

      CONSOLE_LEVELS.forEach(key => {
        GLOBAL_OBJ.console[key]('msg');
      });

      expect(captureLogSpy).toHaveBeenCalledTimes(0);
    });
  });

  it('setup should fail gracefully when console is not available', () => {
    const consoleRef = GLOBAL_OBJ.console;
    // @ts-expect-error remove console
    delete GLOBAL_OBJ.console;

    const captureConsole = consoleLoggingIntegration();
    expect(() => {
      captureConsole.setup?.(mockClient);
    }).not.toThrow();

    // reinstate initial console
    GLOBAL_OBJ.console = consoleRef;
  });

  describe('experiment flag', () => {
    it('should not capture logs when enableLogs is false', () => {
      const clientWithoutLogs = new BrowserClient({
        ...getDefaultBrowserClientOptions(),
        dsn: 'https://username@domain/123',
        _experiments: {
          enableLogs: false,
        },
      });

      setCurrentClient(clientWithoutLogs);
      clientWithoutLogs.init();

      const captureConsole = consoleLoggingIntegration();
      captureConsole.setup?.(clientWithoutLogs);

      GLOBAL_OBJ.console.log('msg');
      expect(captureLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('message formatting', () => {
    it('should properly format messages with different argument types', () => {
      const captureConsole = consoleLoggingIntegration();
      captureConsole.setup?.(mockClient);

      GLOBAL_OBJ.console.log('string', 123, { obj: true }, [1, 2, 3]);
      expect(captureLogSpy).toHaveBeenCalledWith('info', 'string 123 [object Object] 1,2,3');
    });

    it('should handle empty arguments', () => {
      const captureConsole = consoleLoggingIntegration();
      captureConsole.setup?.(mockClient);

      GLOBAL_OBJ.console.log();
      expect(captureLogSpy).toHaveBeenCalledWith('info', '');
    });
  });

  describe('console.assert', () => {
    it('should capture failed assertions as errors', () => {
      const captureConsole = consoleLoggingIntegration();
      captureConsole.setup?.(mockClient);

      GLOBAL_OBJ.console.assert(false, 'Assertion message');
      expect(captureLogSpy).toHaveBeenCalledWith('error', 'Assertion failed: Assertion message');
    });

    it('should not capture successful assertions', () => {
      const captureConsole = consoleLoggingIntegration();
      captureConsole.setup?.(mockClient);

      GLOBAL_OBJ.console.assert(true, 'Assertion message');
      expect(captureLogSpy).not.toHaveBeenCalled();
    });

    it('should handle assert without message', () => {
      const captureConsole = consoleLoggingIntegration();
      captureConsole.setup?.(mockClient);

      GLOBAL_OBJ.console.assert(false);
      expect(captureLogSpy).toHaveBeenCalledWith('error', 'Assertion failed: console.assert');
    });
  });

  describe('client check', () => {
    it('should only capture logs for the current client', () => {
      const captureConsole = consoleLoggingIntegration();
      captureConsole.setup?.(mockClient);

      // Create a different client and set it as current
      const otherClient = new BrowserClient({
        ...getDefaultBrowserClientOptions(),
        dsn: 'https://username@domain/456',
        _experiments: {
          enableLogs: true,
        },
      });
      setCurrentClient(otherClient);
      otherClient.init();

      GLOBAL_OBJ.console.log('msg');
      expect(captureLogSpy).not.toHaveBeenCalled();

      // Set back to original client
      setCurrentClient(mockClient);
      GLOBAL_OBJ.console.log('msg');
      expect(captureLogSpy).toHaveBeenCalled();
    });
  });
});
