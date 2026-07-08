import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSOLE_LEVELS } from '../../../src/utils/debug-logger';
import { GLOBAL_OBJ } from '../../../src/utils/worldwide';

// Capture the pristine console methods once, before any instrumentation wraps them. Each test gets a
// fresh copy of the instrumentation modules (and therefore fresh module-scoped state such as
// `instrumentedLevels`) via `vi.resetModules()`, but the global console object is shared across the
// module registry, so we must also restore it between tests - otherwise a fresh `instrumentConsole()`
// would wrap an already-wrapped method.
const nativeConsoleMethods = Object.fromEntries(
  CONSOLE_LEVELS.map(level => [level, GLOBAL_OBJ.console[level]]),
) as Record<string, unknown>;

function restoreNativeConsole(): void {
  for (const level of CONSOLE_LEVELS) {
    GLOBAL_OBJ.console[level] = nativeConsoleMethods[level] as (typeof GLOBAL_OBJ.console)[typeof level];
  }
}

describe('addConsoleInstrumentationHandler', () => {
  let consoleModule: typeof import('../../../src/instrument/console');
  let debugLoggerModule: typeof import('../../../src/utils/debug-logger');

  beforeEach(async () => {
    vi.resetModules();
    restoreNativeConsole();
    consoleModule = await import('../../../src/instrument/console');
    debugLoggerModule = await import('../../../src/utils/debug-logger');
  });

  afterEach(() => {
    restoreNativeConsole();
    vi.restoreAllMocks();
  });

  // This cannot be done in beforeEach, as the first invocation of `addConsoleInstrumentationHandler` will overwrite the original console methods.
  // Due to `fill` being called
  // So instead, we need to call this each time after calling `addConsoleInstrumentationHandler`
  function mockConsoleMethods() {
    Object.assign(debugLoggerModule.originalConsoleMethods, {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
    });
  }

  it.each(['log', 'warn', 'error', 'debug', 'info'] as const)(
    'calls registered handler when console.%s is called',
    level => {
      const handler = vi.fn();
      consoleModule.addConsoleInstrumentationHandler(handler);
      mockConsoleMethods();

      GLOBAL_OBJ.console[level]('test message');

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ args: ['test message'], level }));
      expect(debugLoggerModule.originalConsoleMethods[level]).toHaveBeenCalledWith('test message');
    },
  );

  it('calls through to the underlying console method without throwing', () => {
    consoleModule.addConsoleInstrumentationHandler(vi.fn());
    mockConsoleMethods();
    expect(() => GLOBAL_OBJ.console.log('hello')).not.toThrow();
  });

  it('does not recurse infinitely when the same SDK copy re-instruments an already-wrapped console', () => {
    // Re-running `instrumentConsole()` within the same copy of `@sentry/core` (e.g. instrumentation
    // state re-initialized in React Native while the console stays wrapped) must not re-wrap our own
    // wrapper. Otherwise the second pass stores that wrapper into `originalConsoleMethods[level]`,
    // which the wrapper reads on every call, so calling through to the "original" re-enters the
    // wrapper forever -> `RangeError: Maximum call stack size exceeded`.
    const handler = vi.fn();
    consoleModule.addConsoleInstrumentationHandler(handler);
    mockConsoleMethods();

    const wrapperAfterFirstPass = GLOBAL_OBJ.console.error;

    // Force a second instrumentation pass on the same copy to mimic re-initialized state.
    consoleModule.instrumentConsole();

    // The second pass must be a no-op: our own wrapper is left in place (identity unchanged),
    // so `originalConsoleMethods[level]` keeps pointing at the real method rather than a wrapper.
    expect(GLOBAL_OBJ.console.error).toBe(wrapperAfterFirstPass);

    expect(() => GLOBAL_OBJ.console.error('boom')).not.toThrow();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ args: ['boom'], level: 'error' }));
    expect(debugLoggerModule.originalConsoleMethods.error).toHaveBeenCalledWith('boom');
  });

  describe('filter', () => {
    describe('when debug is disabled', () => {
      beforeEach(() => {
        vi.spyOn(debugLoggerModule.debug, 'isEnabled').mockImplementation(() => false);
      });

      it('filters out messages that match the filter', () => {
        const handler = vi.fn();
        consoleModule.addConsoleInstrumentationHandler(handler);
        consoleModule.addConsoleInstrumentationFilter(['test message']);
        mockConsoleMethods();

        GLOBAL_OBJ.console.log('test message');

        expect(debugLoggerModule.originalConsoleMethods.log).not.toHaveBeenCalledWith('test message');
        expect(handler).not.toHaveBeenCalled();
      });

      it('does not filter out messages that do not match the filter', () => {
        const handler = vi.fn();
        consoleModule.addConsoleInstrumentationHandler(handler);
        consoleModule.addConsoleInstrumentationFilter(['test message']);
        mockConsoleMethods();

        GLOBAL_OBJ.console.log('other message');

        expect(handler).toHaveBeenCalled();
        expect(debugLoggerModule.originalConsoleMethods.log).toHaveBeenCalledWith('other message');
      });
    });

    describe('when debug is enabled', () => {
      beforeEach(() => {
        vi.spyOn(debugLoggerModule.debug, 'isEnabled').mockImplementation(() => true);
      });

      it('logs filtered messages but does not call the handler for them', () => {
        const handler = vi.fn();
        consoleModule.addConsoleInstrumentationHandler(handler);
        consoleModule.addConsoleInstrumentationFilter(['test message']);
        mockConsoleMethods();

        GLOBAL_OBJ.console.log('test message');

        expect(handler).not.toHaveBeenCalled();
        expect(debugLoggerModule.originalConsoleMethods.log).toHaveBeenCalledWith('test message');
      });
    });
  });
});
