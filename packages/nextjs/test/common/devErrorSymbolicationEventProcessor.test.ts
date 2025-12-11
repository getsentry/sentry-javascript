import type { Event, EventHint, SpanJSON } from '@sentry/core';
import { GLOBAL_OBJ } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { devErrorSymbolicationEventProcessor } from '../../src/common/devErrorSymbolicationEventProcessor';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    debug: {
      error: vi.fn(),
    },
    suppressTracing: vi.fn(fn => fn()),
  };
});

vi.mock('stacktrace-parser', () => ({
  parse: vi.fn(),
}));

global.fetch = vi.fn();

describe('devErrorSymbolicationEventProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (GLOBAL_OBJ as any)._sentryNextJsVersion;
    delete (GLOBAL_OBJ as any)._sentryBasePath;
    delete process.env.PORT;
  });

  describe('Next.js version handling', () => {
    it('should return event early when _sentryNextJsVersion is undefined', async () => {
      const mockEvent: Event = {
        exception: {
          values: [
            {
              stacktrace: {
                frames: [{ filename: 'test.js', lineno: 1 }],
              },
            },
          ],
        },
      };

      const mockHint: EventHint = {
        originalException: new Error('test error'),
      };

      (GLOBAL_OBJ as any)._sentryNextJsVersion = undefined;

      const result = await devErrorSymbolicationEventProcessor(mockEvent, mockHint);

      expect(result).toBe(mockEvent);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should return event early when _sentryNextJsVersion is null', async () => {
      const mockEvent: Event = {
        exception: {
          values: [
            {
              stacktrace: {
                frames: [{ filename: 'test.js', lineno: 1 }],
              },
            },
          ],
        },
      };

      const mockHint: EventHint = {
        originalException: new Error('test error'),
      };

      (GLOBAL_OBJ as any)._sentryNextJsVersion = null;

      const result = await devErrorSymbolicationEventProcessor(mockEvent, mockHint);

      expect(result).toBe(mockEvent);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should return event early when _sentryNextJsVersion is empty string', async () => {
      const mockEvent: Event = {
        exception: {
          values: [
            {
              stacktrace: {
                frames: [{ filename: 'test.js', lineno: 1 }],
              },
            },
          ],
        },
      };

      const mockHint: EventHint = {
        originalException: new Error('test error'),
      };

      (GLOBAL_OBJ as any)._sentryNextJsVersion = '';

      const result = await devErrorSymbolicationEventProcessor(mockEvent, mockHint);

      expect(result).toBe(mockEvent);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should return original event when no originalException in hint', async () => {
      const mockEvent: Event = {
        exception: {
          values: [
            {
              stacktrace: {
                frames: [{ filename: 'test.js', lineno: 1 }],
              },
            },
          ],
        },
      };

      const mockHint: EventHint = {};

      (GLOBAL_OBJ as any)._sentryNextJsVersion = '14.1.0';

      const result = await devErrorSymbolicationEventProcessor(mockEvent, mockHint);

      expect(result).toBe(mockEvent);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should return original event when originalException is not an Error', async () => {
      const mockEvent: Event = {
        exception: {
          values: [
            {
              stacktrace: {
                frames: [{ filename: 'test.js', lineno: 1 }],
              },
            },
          ],
        },
      };

      const mockHint: EventHint = {
        originalException: 'string error',
      };

      (GLOBAL_OBJ as any)._sentryNextJsVersion = '14.1.0';

      const result = await devErrorSymbolicationEventProcessor(mockEvent, mockHint);

      expect(result).toBe(mockEvent);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should return original event when Error has no stack', async () => {
      const mockEvent: Event = {
        exception: {
          values: [
            {
              stacktrace: {
                frames: [{ filename: 'test.js', lineno: 1 }],
              },
            },
          ],
        },
      };

      const errorWithoutStack = new Error('test error');
      delete errorWithoutStack.stack;

      const mockHint: EventHint = {
        originalException: errorWithoutStack,
      };

      (GLOBAL_OBJ as any)._sentryNextJsVersion = '14.1.0';

      const result = await devErrorSymbolicationEventProcessor(mockEvent, mockHint);

      expect(result).toBe(mockEvent);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('transaction span filtering', () => {
    it('should filter out spans with __nextjs_original-stack-frame URLs', async () => {
      const mockEvent: Event = {
        type: 'transaction',
        spans: [
          {
            data: {
              'http.url': 'http://localhost:3000/__nextjs_original-stack-frame?file=test.js',
            },
          },
          {
            data: {
              'http.url': 'http://localhost:3000/__nextjs_original-stack-frames',
            },
          },
          {
            data: {
              'http.url': 'http://localhost:3000/api/users',
            },
          },
          {
            data: {
              'other.attribute': 'value',
            },
          },
        ] as unknown as SpanJSON[], // :^)
      };

      const mockHint: EventHint = {};

      const result = await devErrorSymbolicationEventProcessor(mockEvent, mockHint);

      expect(result?.spans).toHaveLength(2);
      expect(result?.spans?.[0]?.data?.['http.url']).toBe('http://localhost:3000/api/users');
      expect(result?.spans?.[1]?.data?.['other.attribute']).toBe('value');
    });

    it('should preserve spans without http.url attribute', async () => {
      const mockEvent: Event = {
        type: 'transaction',
        spans: [
          {
            data: {
              'other.attribute': 'value',
            },
          },
        ] as unknown as SpanJSON[],
      };

      const mockHint: EventHint = {};

      const result = await devErrorSymbolicationEventProcessor(mockEvent, mockHint);

      expect(result?.spans).toHaveLength(1);
      expect(result?.spans?.[0]?.data?.['other.attribute']).toBe('value');
    });

    it('should handle spans with non-string http.url attribute', async () => {
      const mockEvent: Event = {
        type: 'transaction',
        spans: [
          {
            data: {
              'http.url': 123, // non-string
            },
          },
        ] as unknown as SpanJSON[],
      };

      const mockHint: EventHint = {};

      const result = await devErrorSymbolicationEventProcessor(mockEvent, mockHint);

      expect(result?.spans).toHaveLength(1);
    });
  });

  describe('dev server URL construction', () => {
    it('should use default port 3000 when PORT env variable is not set (Next.js < 15.2)', async () => {
      const mockEvent: Event = {
        exception: {
          values: [
            {
              stacktrace: {
                frames: [{ filename: 'webpack-internal:///./test.js', lineno: 1 }],
              },
            },
          ],
        },
      };

      const testError = new Error('test error');
      testError.stack = 'Error: test error\n    at webpack-internal:///./test.js:1:1';

      const mockHint: EventHint = {
        originalException: testError,
      };

      (GLOBAL_OBJ as any)._sentryNextJsVersion = '14.1.0';

      const stackTraceParser = await import('stacktrace-parser');
      vi.mocked(stackTraceParser.parse).mockReturnValue([
        {
          file: 'webpack-internal:///./test.js',
          methodName: 'testMethod',
          lineNumber: 1,
          column: 1,
          arguments: [],
        },
      ]);

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          originalStackFrame: { file: './test.js', lineNumber: 1, column: 1, methodName: 'testMethod' },
          originalCodeFrame: '> 1 | test code',
        }),
      } as any);

      await devErrorSymbolicationEventProcessor(mockEvent, mockHint);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:3000/__nextjs_original-stack-frame'),
        expect.any(Object),
      );
    });

    it('should use PORT env variable when set (Next.js < 15.2)', async () => {
      process.env.PORT = '4000';

      const mockEvent: Event = {
        exception: {
          values: [
            {
              stacktrace: {
                frames: [{ filename: 'webpack-internal:///./test.js', lineno: 1 }],
              },
            },
          ],
        },
      };

      const testError = new Error('test error');
      testError.stack = 'Error: test error\n    at webpack-internal:///./test.js:1:1';

      const mockHint: EventHint = {
        originalException: testError,
      };

      (GLOBAL_OBJ as any)._sentryNextJsVersion = '14.1.0';

      const stackTraceParser = await import('stacktrace-parser');
      vi.mocked(stackTraceParser.parse).mockReturnValue([
        {
          file: 'webpack-internal:///./test.js',
          methodName: 'testMethod',
          lineNumber: 1,
          column: 1,
          arguments: [],
        },
      ]);

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          originalStackFrame: { file: './test.js', lineNumber: 1, column: 1, methodName: 'testMethod' },
          originalCodeFrame: '> 1 | test code',
        }),
      } as any);

      await devErrorSymbolicationEventProcessor(mockEvent, mockHint);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:4000/__nextjs_original-stack-frame'),
        expect.any(Object),
      );
    });

    it('should use default port 3000 when PORT env variable is not set (Next.js >= 15.2)', async () => {
      const mockEvent: Event = {
        exception: {
          values: [
            {
              stacktrace: {
                frames: [{ filename: 'file:///test.js', lineno: 1 }],
              },
            },
          ],
        },
      };

      const testError = new Error('test error');
      testError.stack = 'Error: test error\n    at file:///test.js:1:1';

      const mockHint: EventHint = {
        originalException: testError,
      };

      (GLOBAL_OBJ as any)._sentryNextJsVersion = '15.2.0';

      const stackTraceParser = await import('stacktrace-parser');
      vi.mocked(stackTraceParser.parse).mockReturnValue([
        {
          file: 'file:///test.js',
          methodName: 'testMethod',
          lineNumber: 1,
          column: 1,
          arguments: [],
        },
      ]);

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            value: {
              originalStackFrame: { file: './test.js', lineNumber: 1, column: 1, methodName: 'testMethod' },
              originalCodeFrame: '> 1 | test code',
            },
          },
        ],
      } as any);

      await devErrorSymbolicationEventProcessor(mockEvent, mockHint);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:3000/__nextjs_original-stack-frames'),
        expect.any(Object),
      );
    });

    it('should use PORT env variable when set (Next.js >= 15.2)', async () => {
      process.env.PORT = '4000';

      const mockEvent: Event = {
        exception: {
          values: [
            {
              stacktrace: {
                frames: [{ filename: 'file:///test.js', lineno: 1 }],
              },
            },
          ],
        },
      };

      const testError = new Error('test error');
      testError.stack = 'Error: test error\n    at file:///test.js:1:1';

      const mockHint: EventHint = {
        originalException: testError,
      };

      (GLOBAL_OBJ as any)._sentryNextJsVersion = '15.2.0';

      const stackTraceParser = await import('stacktrace-parser');
      vi.mocked(stackTraceParser.parse).mockReturnValue([
        {
          file: 'file:///test.js',
          methodName: 'testMethod',
          lineNumber: 1,
          column: 1,
          arguments: [],
        },
      ]);

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            value: {
              originalStackFrame: { file: './test.js', lineNumber: 1, column: 1, methodName: 'testMethod' },
              originalCodeFrame: '> 1 | test code',
            },
          },
        ],
      } as any);

      await devErrorSymbolicationEventProcessor(mockEvent, mockHint);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:4000/__nextjs_original-stack-frames'),
        expect.any(Object),
      );
    });
  });
});
