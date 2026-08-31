import { describe, expect, it, vi } from 'vitest';
import { sampleSpan } from '../../../src/tracing/sampling';
import * as debugLoggerModule from '../../../src/utils/debug-logger';

describe('sampleSpan', () => {
  describe('when `tracesSampler` throws', () => {
    const exception = new Error('tracesSampler failed');
    const tracesSampler = vi.fn(() => {
      throw exception;
    });
    const expectedMessage =
      'The `tracesSampler` callback threw an error, falling back to the parent sampling decision or `tracesSampleRate`:';

    it('inherits the parent sampling decision', () => {
      const debugErrorSpy = vi.spyOn(debugLoggerModule.debug, 'error');

      expect(sampleSpan({ tracesSampler }, { name: 'test', attributes: {}, parentSampled: true }, 0.5)).toEqual([
        true,
        1,
        undefined,
      ]);
      expect(sampleSpan({ tracesSampler }, { name: 'test', attributes: {}, parentSampled: false }, 0.5)).toEqual([
        false,
        0,
        undefined,
      ]);
      expect(debugErrorSpy).toHaveBeenCalledWith(expectedMessage, exception);
    });

    it('falls back to `tracesSampleRate` without a parent decision', () => {
      const debugErrorSpy = vi.spyOn(debugLoggerModule.debug, 'error');

      expect(sampleSpan({ tracesSampler, tracesSampleRate: 0.6 }, { name: 'test', attributes: {} }, 0.5)).toEqual([
        true,
        0.6,
        true,
      ]);
      expect(debugErrorSpy).toHaveBeenCalledWith(expectedMessage, exception);
    });

    it('does not sample when there is nothing to fall back to', () => {
      const debugErrorSpy = vi.spyOn(debugLoggerModule.debug, 'error');
      const debugWarnSpy = vi.spyOn(debugLoggerModule.debug, 'warn');

      expect(sampleSpan({ tracesSampler }, { name: 'test', attributes: {} }, 0.5)).toEqual([false]);
      expect(debugErrorSpy).toHaveBeenCalledWith(expectedMessage, exception);
      expect(debugWarnSpy).not.toHaveBeenCalled();
    });
  });
});
