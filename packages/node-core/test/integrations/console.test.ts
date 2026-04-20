// Set LAMBDA_TASK_ROOT before any imports so consoleIntegration uses patchWithDefineProperty
process.env.LAMBDA_TASK_ROOT = '/var/task';

import { afterAll, describe, expect, it, vi } from 'vitest';
import type { WrappedFunction } from '@sentry/core';
import {
  addConsoleInstrumentationHandler,
  consoleSandbox,
  markFunctionWrapped,
  originalConsoleMethods,
  GLOBAL_OBJ,
} from '@sentry/core';
import { consoleIntegration } from '../../src/integrations/console';

// Capture the real native method before any patches are installed.
// This simulates external code doing `const log = console.log` before Sentry init.
// oxlint-disable-next-line no-console
const nativeConsoleLog = console.log;

afterAll(() => {
  delete process.env.LAMBDA_TASK_ROOT;
});

describe('consoleIntegration in Lambda (patchWithDefineProperty)', () => {
  it('calls registered handler when console.log is called', () => {
    const handler = vi.fn();
    // Setup the integration so it calls maybeInstrument with the Lambda strategy
    consoleIntegration().setup?.({ on: vi.fn() } as any);

    addConsoleInstrumentationHandler(handler);

    GLOBAL_OBJ.console.log('test');

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ args: ['test'], level: 'log' }));
  });

  describe('external replacement (e.g. Lambda runtime overwriting console)', () => {
    it('keeps firing the handler after console.log is replaced externally', () => {
      const handler = vi.fn();
      addConsoleInstrumentationHandler(handler);

      GLOBAL_OBJ.console.log = vi.fn();
      handler.mockClear();

      GLOBAL_OBJ.console.log('after replacement');

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ args: ['after replacement'], level: 'log' }));
    });

    it('calls the external replacement as the underlying method', () => {
      addConsoleInstrumentationHandler(vi.fn());

      const lambdaLogger = vi.fn();
      GLOBAL_OBJ.console.log = lambdaLogger;

      GLOBAL_OBJ.console.log('hello');

      expect(lambdaLogger).toHaveBeenCalledWith('hello');
    });

    it('always delegates to the latest replacement', () => {
      addConsoleInstrumentationHandler(vi.fn());

      const first = vi.fn();
      const second = vi.fn();

      GLOBAL_OBJ.console.log = first;
      GLOBAL_OBJ.console.log = second;

      GLOBAL_OBJ.console.log('latest');

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledWith('latest');
    });

    it('does not mutate originalConsoleMethods (kept safe for consoleSandbox)', () => {
      addConsoleInstrumentationHandler(vi.fn());

      const nativeLog = originalConsoleMethods.log;
      GLOBAL_OBJ.console.log = vi.fn();

      expect(originalConsoleMethods.log).toBe(nativeLog);
    });
  });

  describe('__sentry_original__ detection', () => {
    it('accepts a function with __sentry_original__ without re-wrapping', () => {
      const handler = vi.fn();
      addConsoleInstrumentationHandler(handler);

      const otherWrapper = vi.fn();
      markFunctionWrapped(otherWrapper as unknown as WrappedFunction, vi.fn() as unknown as WrappedFunction);

      GLOBAL_OBJ.console.log = otherWrapper;

      expect(GLOBAL_OBJ.console.log).toBe(otherWrapper);
    });

    it('does not fire our handler when a __sentry_original__ wrapper is installed', () => {
      const handler = vi.fn();
      addConsoleInstrumentationHandler(handler);

      const otherWrapper = vi.fn();
      markFunctionWrapped(otherWrapper as unknown as WrappedFunction, vi.fn() as unknown as WrappedFunction);

      GLOBAL_OBJ.console.log = otherWrapper;
      handler.mockClear();

      GLOBAL_OBJ.console.log('via other wrapper');

      expect(handler).not.toHaveBeenCalled();
      expect(otherWrapper).toHaveBeenCalledWith('via other wrapper');
    });

    it('re-wraps a plain function without __sentry_original__', () => {
      const handler = vi.fn();
      addConsoleInstrumentationHandler(handler);

      GLOBAL_OBJ.console.log = vi.fn();
      handler.mockClear();

      GLOBAL_OBJ.console.log('plain');

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ args: ['plain'], level: 'log' }));
    });
  });

  describe('consoleSandbox interaction', () => {
    it('does not fire the handler inside consoleSandbox', () => {
      const handler = vi.fn();
      addConsoleInstrumentationHandler(handler);
      handler.mockClear();

      consoleSandbox(() => {
        GLOBAL_OBJ.console.log('sandbox message');
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('resumes firing the handler after consoleSandbox returns', () => {
      const handler = vi.fn();
      addConsoleInstrumentationHandler(handler);

      consoleSandbox(() => {
        GLOBAL_OBJ.console.log('inside sandbox');
      });
      handler.mockClear();

      GLOBAL_OBJ.console.log('after sandbox');

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ args: ['after sandbox'], level: 'log' }));
      expect(handler).not.toHaveBeenCalledWith(expect.objectContaining({ args: ['inside sandbox'], level: 'log' }));
    });

    it('does not fire the handler inside consoleSandbox after a Lambda-style replacement', () => {
      const handler = vi.fn();
      addConsoleInstrumentationHandler(handler);

      GLOBAL_OBJ.console.log = vi.fn();
      handler.mockClear();

      consoleSandbox(() => {
        GLOBAL_OBJ.console.log('sandbox after lambda');
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('third-party capture-and-call wrapping', () => {
    it('does not cause infinite recursion when a third party wraps console with the capture pattern', () => {
      const handler = vi.fn();
      addConsoleInstrumentationHandler(handler);
      handler.mockClear();

      const prevLog = GLOBAL_OBJ.console.log;
      const thirdPartyExtra = vi.fn();
      GLOBAL_OBJ.console.log = (...args: any[]) => {
        prevLog(...args);
        thirdPartyExtra(...args);
      };

      expect(() => GLOBAL_OBJ.console.log('should not overflow')).not.toThrow();

      expect(thirdPartyExtra).toHaveBeenCalledWith('should not overflow');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ args: ['should not overflow'], level: 'log' }));
    });

    it('fires the handler exactly once on re-entrant calls', () => {
      const handler = vi.fn();
      addConsoleInstrumentationHandler(handler);
      handler.mockClear();

      const callOrder: string[] = [];

      const prevLog = GLOBAL_OBJ.console.log;
      GLOBAL_OBJ.console.log = (...args: any[]) => {
        callOrder.push('delegate-before-prev');
        prevLog(...args);
        callOrder.push('delegate-after-prev');
      };

      handler.mockImplementation(() => {
        callOrder.push('handler');
      });

      GLOBAL_OBJ.console.log('re-entrant test');

      // The handler fires exactly once — on the first (outer) entry.
      // The re-entrant call through prev() must NOT trigger it a second time.
      expect(handler).toHaveBeenCalledTimes(1);

      // Verify the full call order:
      // 1. wrapper enters → triggerHandlers → handler fires
      // 2. wrapper calls consoleDelegate (third-party fn)
      // 3. third-party fn calls prev() → re-enters wrapper → nativeMethod (no handler)
      // 4. third-party fn continues after prev()
      expect(callOrder).toEqual(['handler', 'delegate-before-prev', 'delegate-after-prev']);
    });

    it('consoleSandbox still bypasses the handler after third-party wrapping', () => {
      const handler = vi.fn();
      addConsoleInstrumentationHandler(handler);

      const prevLog = GLOBAL_OBJ.console.log;
      GLOBAL_OBJ.console.log = (...args: any[]) => {
        prevLog(...args);
      };
      handler.mockClear();

      consoleSandbox(() => {
        GLOBAL_OBJ.console.log('should bypass');
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('keeps firing the handler when console.log is set back to the original native method', () => {
      const handler = vi.fn();
      addConsoleInstrumentationHandler(handler);

      // Simulate Lambda-style replacement
      GLOBAL_OBJ.console.log = vi.fn();
      handler.mockClear();

      // Simulate external code restoring a native method reference it captured
      // before Sentry init — this should NOT clobber the wrapper.
      GLOBAL_OBJ.console.log = nativeConsoleLog;

      GLOBAL_OBJ.console.log('after restore to original');

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ args: ['after restore to original'], level: 'log' }),
      );
    });
  });
});
