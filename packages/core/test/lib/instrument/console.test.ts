import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _INTERNAL_resetConsoleInstrumentationOptions,
  addConsoleInstrumentationFilter,
  addConsoleInstrumentationHandler,
} from '../../../src/instrument/console';
import { GLOBAL_OBJ } from '../../../src/utils/worldwide';
import { debug, originalConsoleMethods } from '../../../src/utils/debug-logger';
import { resetInstrumentationHandlers } from '../../../src/instrument/handlers';

describe('addConsoleInstrumentationHandler', () => {
  let _originalConsoleMethods: typeof originalConsoleMethods = {};

  afterEach(() => {
    Object.assign(originalConsoleMethods, _originalConsoleMethods);
    resetInstrumentationHandlers();
    vi.restoreAllMocks();
  });

  // This cannot be done in beforeEach, as the first invocation of `addConsoleInstrumentationHandler` will overwrite the original console methods.
  // Due to `fill` being called
  // So instead, we need to call this each time after calling `addConsoleInstrumentationHandler`
  function mockConsoleMethods() {
    // Re-store this with the current implementation
    Object.assign(_originalConsoleMethods, originalConsoleMethods);

    // Overwrite with mock console methods
    Object.assign(originalConsoleMethods, {
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
      addConsoleInstrumentationHandler(handler);
      mockConsoleMethods();

      GLOBAL_OBJ.console[level]('test message');

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ args: ['test message'], level }));
      expect(originalConsoleMethods[level]).toHaveBeenCalledWith('test message');
    },
  );

  it('calls through to the underlying console method without throwing', () => {
    addConsoleInstrumentationHandler(vi.fn());
    mockConsoleMethods();
    expect(() => GLOBAL_OBJ.console.log('hello')).not.toThrow();
  });

  describe('filter', () => {
    afterEach(() => {
      _INTERNAL_resetConsoleInstrumentationOptions();
    });

    describe('when debug is disabled', () => {
      beforeEach(() => {
        vi.spyOn(debug, 'isEnabled').mockImplementation(() => false);
      });

      it('filters out messages that match the filter', () => {
        const handler = vi.fn();
        addConsoleInstrumentationHandler(handler);
        addConsoleInstrumentationFilter(['test message']);
        mockConsoleMethods();

        GLOBAL_OBJ.console.log('test message');

        expect(originalConsoleMethods.log).not.toHaveBeenCalledWith('test message');
        expect(handler).not.toHaveBeenCalled();
      });

      it('does not filter out messages that do not match the filter', () => {
        const handler = vi.fn();
        addConsoleInstrumentationHandler(handler);
        addConsoleInstrumentationFilter(['test message']);
        mockConsoleMethods();

        GLOBAL_OBJ.console.log('other message');

        expect(handler).toHaveBeenCalled();
        expect(originalConsoleMethods.log).toHaveBeenCalledWith('other message');
      });
    });

    describe('when debug is enabled', () => {
      beforeEach(() => {
        vi.spyOn(debug, 'isEnabled').mockImplementation(() => true);
      });

      it('logs filtered messages but does not call the handler for them', () => {
        const handler = vi.fn();
        addConsoleInstrumentationHandler(handler);
        addConsoleInstrumentationFilter(['test message']);
        mockConsoleMethods();

        GLOBAL_OBJ.console.log('test message');

        expect(handler).not.toHaveBeenCalled();
        expect(originalConsoleMethods.log).toHaveBeenCalledWith('test message');
      });
    });
  });
});
