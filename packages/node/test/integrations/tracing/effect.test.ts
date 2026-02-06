import { captureException, getCurrentScope, startSpan, withScope } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let effectIntegration: any;
let instrumentEffect: any;
let sentryTracer: any;
let mockEffectModule: {
  Tracer: {
    [key: string]: any;
    get: ReturnType<typeof vi.fn>;
    current: ReturnType<typeof vi.fn>;
    set?: ReturnType<typeof vi.fn>;
    register?: ReturnType<typeof vi.fn>;
    use?: ReturnType<typeof vi.fn>;
  };
};

// Mock Sentry core before importing the integration
vi.mock('@sentry/core', () => ({
  defineIntegration: vi.fn(fn => fn),
  captureException: vi.fn(),
  getCurrentScope: vi.fn(() => ({
    setTag: vi.fn(),
    setContext: vi.fn(),
  })),
  startSpan: vi.fn((options, callback) => {
    const mockSpan = {
      setStatus: vi.fn(),
      setData: vi.fn(),
    };
    return callback ? callback(mockSpan) : undefined;
  }),
  withScope: vi.fn(callback => {
    const mockScope = {
      setTag: vi.fn(),
      setContext: vi.fn(),
    };
    return callback(mockScope);
  }),
}));

function setupEffectMock(method: 'set' | 'register' | 'use' = 'set') {
  sentryTracer = undefined;
  mockEffectModule = {
    Tracer: {
      get: vi.fn(),
      current: vi.fn(),
      set: undefined,
      register: undefined,
      use: undefined,
    },
  };
  mockEffectModule.Tracer[method] = vi.fn((tracer: unknown) => {
    sentryTracer = tracer;
  });
  vi.doMock('effect', () => mockEffectModule);
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('Effect Integration', () => {
  beforeEach(async () => {
    setupEffectMock('set');
    vi.resetModules();
    const imported = await import('../../../src/integrations/tracing/effect');
    effectIntegration = imported.effectIntegration;
    instrumentEffect = imported.instrumentEffect;
    instrumentEffect.isInstrumentationEnabled = false;
  });

  it('should call instrumentEffect when setupOnce is called', () => {
    const integration = effectIntegration();
    const instrumentSpy = vi.spyOn(instrumentEffect, 'call');
    integration.setupOnce!();
    expect(instrumentSpy).toHaveBeenCalled();
  });
});

describe('instrumentEffect', () => {
  it('should have the correct id property', () => {
    expect(instrumentEffect.id).toBe('Effect');
  });

  it('should not instrument if Effect.Tracer is not available', () => {
    // Mock require to return undefined Tracer
    vi.doMock('effect', () => ({}));

    instrumentEffect();

    expect(mockEffectModule.Tracer.set).not.toHaveBeenCalled();
    expect(mockEffectModule.Tracer.register).not.toHaveBeenCalled();
    expect(mockEffectModule.Tracer.use).not.toHaveBeenCalled();
  });

  it('should register a Sentry tracer when Effect.Tracer.set is available', () => {
    setupEffectMock('set');
    instrumentEffect();
    expect(mockEffectModule.Tracer.set).toHaveBeenCalledWith(
      expect.objectContaining({
        onSpanStart: expect.any(Function),
        onSpanEnd: expect.any(Function),
        span: expect.any(Function),
        withSpan: expect.any(Function),
      }),
    );
    expect(sentryTracer).toBeDefined();
  });

  it('should register a Sentry tracer when Effect.Tracer.register is available', () => {
    setupEffectMock('register');
    instrumentEffect();
    expect(mockEffectModule.Tracer.register).toHaveBeenCalledWith(
      expect.objectContaining({
        onSpanStart: expect.any(Function),
        onSpanEnd: expect.any(Function),
        span: expect.any(Function),
        withSpan: expect.any(Function),
      }),
    );
    expect(sentryTracer).toBeDefined();
  });

  it('should register a Sentry tracer when Effect.Tracer.use is available', () => {
    setupEffectMock('use');
    instrumentEffect.call();
    expect(mockEffectModule.Tracer.use).toHaveBeenCalledWith(
      expect.objectContaining({
        onSpanStart: expect.any(Function),
        onSpanEnd: expect.any(Function),
        span: expect.any(Function),
        withSpan: expect.any(Function),
      }),
    );
    expect(sentryTracer).toBeDefined();
  });

  it('should not instrument twice', () => {
    setupEffectMock('set');
    instrumentEffect.call();
    instrumentEffect.call(); // Call again
    expect(mockEffectModule.Tracer.set).toHaveBeenCalledTimes(1);
  });

  it('should handle require errors gracefully', () => {
    // Mock require to throw an error
    vi.doMock('effect', () => {
      throw new Error('Module not found');
    });

    expect(() => instrumentEffect.call()).not.toThrow();
  });
});

describe('Effect Tracer Implementation', () => {
  beforeEach(() => {
    setupEffectMock('set');
    instrumentEffect.call();
  });

  describe('span method', () => {
    it('should create a Sentry span with correct properties', () => {
      const testFunction = vi.fn(() => 'result');

      const result = sentryTracer.span('test-span', testFunction);

      expect(startSpan).toHaveBeenCalledWith(
        {
          name: 'test-span',
          op: 'effect.span',
          origin: 'auto.effect',
        },
        expect.any(Function),
      );
      expect(testFunction).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should capture exceptions and re-throw them', () => {
      const error = new Error('Test error');
      const throwingFunction = vi.fn(() => {
        throw error;
      });
      const mockScope = { setTag: vi.fn() };
      (getCurrentScope as any).mockReturnValue(mockScope);

      expect(() => sentryTracer.span('test-span', throwingFunction)).toThrow(error);

      expect(mockScope.setTag).toHaveBeenCalledWith('effect.error', true);
      expect(captureException).toHaveBeenCalledWith(error);
    });
  });

  describe('withSpan method', () => {
    it('should create a Sentry span with Effect span properties', () => {
      const effectSpan = {
        name: 'effect-span',
        startTime: BigInt(1000000000), // 1 second in nanoseconds
        attributes: { key: 'value' },
      };
      const testFunction = vi.fn(() => 'result');

      const result = sentryTracer.withSpan(effectSpan, testFunction);

      expect(startSpan).toHaveBeenCalledWith(
        {
          name: 'effect-span',
          op: 'effect.span',
          origin: 'auto.effect',
          startTime: 1, // Converted from nanoseconds to milliseconds
          data: { key: 'value' },
        },
        expect.any(Function),
      );
      expect(testFunction).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should set error status when Effect span has error status', () => {
      const effectSpan = {
        name: 'effect-span',
        startTime: BigInt(1000000000),
        status: { code: 1, message: 'Error occurred' },
      };
      const testFunction = vi.fn(() => 'result');
      const mockSentrySpan = { setStatus: vi.fn(), setData: vi.fn() };

      (startSpan as any).mockImplementation((options: any, callback: any) => {
        return callback(mockSentrySpan);
      });

      sentryTracer.withSpan(effectSpan, testFunction);

      expect(mockSentrySpan.setStatus).toHaveBeenCalledWith('internal_error');
      expect(mockSentrySpan.setData).toHaveBeenCalledWith('effect.status_message', 'Error occurred');
    });

    it('should handle exceptions in withSpan', () => {
      const error = new Error('Test error');
      const effectSpan = {
        name: 'effect-span',
        startTime: BigInt(1000000000),
      };
      const throwingFunction = vi.fn(() => {
        throw error;
      });
      const mockSentrySpan = { setStatus: vi.fn(), setData: vi.fn() };
      const mockScope = { setTag: vi.fn() };

      (startSpan as any).mockImplementation((options: any, callback: any) => {
        return callback(mockSentrySpan);
      });
      (getCurrentScope as any).mockReturnValue(mockScope);

      expect(() => sentryTracer.withSpan(effectSpan, throwingFunction)).toThrow(error);

      expect(mockSentrySpan.setStatus).toHaveBeenCalledWith('internal_error');
      expect(mockScope.setTag).toHaveBeenCalledWith('effect.error', true);
      expect(captureException).toHaveBeenCalledWith(error);
    });
  });

  describe('onSpanEnd method', () => {
    it('should capture exceptions for failed Effect exits', () => {
      const effectSpan = {
        name: 'failed-span',
        startTime: BigInt(1000000000),
        endTime: BigInt(2000000000),
      };
      const failureExit = {
        _tag: 'Failure',
        cause: new Error('Effect failed'),
      };
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };

      (withScope as any).mockImplementation((callback: any) => {
        return callback(mockScope);
      });

      sentryTracer.onSpanEnd(effectSpan, failureExit);

      expect(withScope).toHaveBeenCalled();
      expect(mockScope.setTag).toHaveBeenCalledWith('effect.exit_tag', 'Failure');
      expect(mockScope.setContext).toHaveBeenCalledWith('effect.span', {
        name: 'failed-span',
        startTime: 1000000000,
        endTime: 2000000000,
      });
      expect(captureException).toHaveBeenCalledWith(new Error('Effect failed'));
    });

    it('should not capture exceptions for successful Effect exits', () => {
      const effectSpan = {
        name: 'successful-span',
        startTime: BigInt(1000000000),
      };
      const successExit = {
        _tag: 'Success',
        value: 'result',
      };

      sentryTracer.onSpanEnd(effectSpan, successExit);

      expect(withScope).not.toHaveBeenCalled();
      expect(captureException).not.toHaveBeenCalled();
    });

    it('should call original tracer onSpanEnd if it exists', () => {
      const originalTracer = {
        onSpanEnd: vi.fn(),
      };
      mockEffectModule.Tracer.get.mockReturnValue(originalTracer);

      // Re-instrument to pick up the original tracer
      instrumentEffect.isInstrumentationEnabled = false;
      instrumentEffect();

      const effectSpan = { name: 'test', startTime: BigInt(0) };
      const exit = { _tag: 'Success' };

      sentryTracer.onSpanEnd(effectSpan, exit);

      expect(originalTracer.onSpanEnd).toHaveBeenCalledWith(effectSpan, exit);
    });
  });

  describe('onSpanStart method', () => {
    it('should call original tracer onSpanStart if it exists', () => {
      const originalTracer = {
        onSpanStart: vi.fn(),
      };
      mockEffectModule.Tracer.get.mockReturnValue(originalTracer);

      // Re-instrument to pick up the original tracer
      instrumentEffect.isInstrumentationEnabled = false;
      instrumentEffect();

      const effectSpan = { name: 'test', startTime: BigInt(0) };

      sentryTracer.onSpanStart(effectSpan);

      expect(originalTracer.onSpanStart).toHaveBeenCalledWith(effectSpan);
    });
  });
});
// ...existing code...
