import { SpanStatusCode } from '@opentelemetry/api';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AwsLambdaInstrumentation } from '../src/integration/instrumentation-aws-lambda/instrumentation';

function createMockTracerProvider(forceFlushImpl: () => Promise<void>) {
  return {
    getTracer: () => ({
      startSpan: vi.fn(),
      startActiveSpan: vi.fn(),
    }),
    forceFlush: forceFlushImpl,
  };
}

describe('AwsLambdaInstrumentation', () => {
  describe('_endSpan', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    test('callback fires even when tracerProvider.forceFlush() never resolves', async () => {
      vi.useFakeTimers();

      const instrumentation = new AwsLambdaInstrumentation();

      const hangingProvider = createMockTracerProvider(() => new Promise<void>(() => {}));
      instrumentation.setTracerProvider(hangingProvider as any);

      const mockSpan = {
        end: vi.fn(),
        recordException: vi.fn(),
        setStatus: vi.fn(),
      };

      const callback = vi.fn();

      (instrumentation as any)._endSpan(mockSpan, undefined, callback);

      // Advance past any reasonable timeout (e.g. 5s) — the callback should fire
      // within a bounded time even if forceFlush() hangs forever.
      await vi.advanceTimersByTimeAsync(5_000);

      expect(mockSpan.end).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    test('callback fires promptly when tracerProvider.forceFlush() resolves', async () => {
      const instrumentation = new AwsLambdaInstrumentation();

      const normalProvider = createMockTracerProvider(() => Promise.resolve());
      instrumentation.setTracerProvider(normalProvider as any);

      const mockSpan = {
        end: vi.fn(),
        recordException: vi.fn(),
        setStatus: vi.fn(),
      };

      const callback = vi.fn();

      (instrumentation as any)._endSpan(mockSpan, undefined, callback);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(callback).toHaveBeenCalledTimes(1);
      expect(mockSpan.end).toHaveBeenCalled();
    });

    test('error information is set on span before flush attempt', async () => {
      const instrumentation = new AwsLambdaInstrumentation();

      const normalProvider = createMockTracerProvider(() => Promise.resolve());
      instrumentation.setTracerProvider(normalProvider as any);

      const mockSpan = {
        end: vi.fn(),
        recordException: vi.fn(),
        setStatus: vi.fn(),
      };

      const error = new Error('lambda failure');
      const callback = vi.fn();

      (instrumentation as any)._endSpan(mockSpan, error, callback);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'lambda failure',
      });
      expect(mockSpan.end).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
