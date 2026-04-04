import 'reflect-metadata';
import * as core from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SentryNestBullMQInstrumentation } from '../../src/integrations/sentry-nest-bullmq-instrumentation';

// Metadata key matching @nestjs/bullmq's @OnWorkerEvent decorator
const ON_WORKER_EVENT_METADATA = 'bullmq:worker_events_metadata';

describe('BullMQInstrumentation', () => {
  let instrumentation: SentryNestBullMQInstrumentation;
  const mockSpan = { end: vi.fn() };

  beforeEach(() => {
    instrumentation = new SentryNestBullMQInstrumentation();
    vi.spyOn(core, 'captureException');
    vi.spyOn(core, 'withIsolationScope').mockImplementation((...args: unknown[]) => {
      // Handle both overloads: (callback) and (scope, callback)
      if (args.length === 2) {
        return (args[1] as (scope: unknown) => unknown)(args[0]);
      }
      return (args[0] as (scope: unknown) => unknown)({});
    });
    vi.spyOn(core, 'startSpanManual').mockImplementation((_, callback) => {
      return (callback as (span: unknown) => unknown)(mockSpan);
    });
    vi.spyOn(core, 'addNonEnumerableProperty').mockImplementation((obj: any, key: string, value: unknown) => {
      obj[key] = value;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockSpan.end.mockClear();
  });

  describe('Processor decorator wrapping', () => {
    let wrappedDecorator: any;
    let mockClassDecorator: vi.Mock;
    let mockProcessor: any;

    beforeEach(() => {
      mockClassDecorator = vi.fn().mockImplementation(() => {
        return (target: any) => target;
      });

      const moduleDef = instrumentation.init();
      const file = moduleDef.files[0];
      const moduleExports = { Processor: mockClassDecorator };
      file?.patch(moduleExports);
      wrappedDecorator = moduleExports.Processor;
    });

    it('should call withIsolationScope and startSpanManual on process execution', async () => {
      const originalProcess = vi.fn().mockResolvedValue('result');

      mockProcessor = class TestProcessor {
        process = originalProcess;
      };
      mockProcessor.prototype.process = originalProcess;

      const classDecoratorFn = wrappedDecorator('test-queue');
      classDecoratorFn(mockProcessor);

      await mockProcessor.prototype.process({ id: '1' });

      expect(core.withIsolationScope).toHaveBeenCalled();
      expect(core.startSpanManual).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-queue process',
          forceTransaction: true,
          attributes: expect.objectContaining({
            'sentry.op': 'queue.process',
            'sentry.origin': 'auto.queue.nestjs.bullmq',
            'messaging.system': 'bullmq',
            'messaging.destination.name': 'test-queue',
          }),
        }),
        expect.any(Function),
      );
      expect(originalProcess).toHaveBeenCalled();
    });

    it('should capture async exceptions and rethrow', async () => {
      const error = new Error('Test error');
      const originalProcess = vi.fn().mockRejectedValue(error);

      mockProcessor = class TestProcessor {};
      mockProcessor.prototype.process = originalProcess;

      const classDecoratorFn = wrappedDecorator('test-queue');
      classDecoratorFn(mockProcessor);

      await expect(mockProcessor.prototype.process({ id: '1' })).rejects.toThrow(error);
      expect(core.captureException).toHaveBeenCalledWith(error, {
        mechanism: {
          handled: false,
          type: 'auto.queue.nestjs.bullmq',
        },
      });
    });

    it('should skip wrapping when __SENTRY_INTERNAL__ is set', async () => {
      const originalProcess = vi.fn().mockResolvedValue('result');

      mockProcessor = class TestProcessor {};
      mockProcessor.prototype.process = originalProcess;
      mockProcessor.__SENTRY_INTERNAL__ = true;

      const classDecoratorFn = wrappedDecorator('test-queue');
      classDecoratorFn(mockProcessor);

      // process should not be wrapped
      expect(mockProcessor.prototype.process).toBe(originalProcess);
    });

    it('should not double-wrap process method', async () => {
      const originalProcess = vi.fn().mockResolvedValue('result');

      mockProcessor = class TestProcessor {};
      mockProcessor.prototype.process = originalProcess;

      const classDecoratorFn = wrappedDecorator('test-queue');
      classDecoratorFn(mockProcessor);

      const wrappedProcess = mockProcessor.prototype.process;
      expect(wrappedProcess).not.toBe(originalProcess);

      // Apply decorator again
      const classDecoratorFn2 = wrappedDecorator('test-queue');
      classDecoratorFn2(mockProcessor);

      // Should still be the same wrapped function (not double-wrapped)
      expect(mockProcessor.prototype.process).toBe(wrappedProcess);
    });

    it('should extract queue name from ProcessorOptions object', async () => {
      const originalProcess = vi.fn().mockResolvedValue('result');

      mockProcessor = class TestProcessor {};
      mockProcessor.prototype.process = originalProcess;

      const classDecoratorFn = wrappedDecorator({ name: 'my-queue' });
      classDecoratorFn(mockProcessor);

      await mockProcessor.prototype.process({ id: '1' });

      expect(core.startSpanManual).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'my-queue process',
        }),
        expect.any(Function),
      );
    });

    it('should apply the original class decorator', () => {
      const originalProcess = vi.fn().mockResolvedValue('result');

      mockProcessor = class TestProcessor {};
      mockProcessor.prototype.process = originalProcess;

      const classDecoratorFn = wrappedDecorator('test-queue');
      classDecoratorFn(mockProcessor);

      expect(mockClassDecorator).toHaveBeenCalledWith('test-queue');
    });

    it('should end span in process() when no terminal handlers are defined', async () => {
      const originalProcess = vi.fn().mockResolvedValue('result');

      mockProcessor = class TestProcessor {};
      mockProcessor.prototype.process = originalProcess;

      const classDecoratorFn = wrappedDecorator('test-queue');
      classDecoratorFn(mockProcessor);

      await mockProcessor.prototype.process({ id: '1' });

      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should not end span in process() when completed handler is defined and process succeeds', async () => {
      const originalProcess = vi.fn().mockResolvedValue('result');
      const onCompleted = vi.fn();

      mockProcessor = class TestProcessor {};
      mockProcessor.prototype.process = originalProcess;
      mockProcessor.prototype.onCompleted = onCompleted;
      Reflect.defineMetadata(ON_WORKER_EVENT_METADATA, { eventName: 'completed' }, onCompleted);

      const classDecoratorFn = wrappedDecorator('test-queue');
      classDecoratorFn(mockProcessor);

      await mockProcessor.prototype.process({ id: '1' });

      // Span should NOT be ended by process() — completed handler will end it
      expect(mockSpan.end).not.toHaveBeenCalled();
    });

    it('should end span in process() when completed handler exists but process throws', async () => {
      const error = new Error('Test error');
      const originalProcess = vi.fn().mockRejectedValue(error);
      const onCompleted = vi.fn();

      mockProcessor = class TestProcessor {};
      mockProcessor.prototype.process = originalProcess;
      mockProcessor.prototype.onCompleted = onCompleted;
      Reflect.defineMetadata(ON_WORKER_EVENT_METADATA, { eventName: 'completed' }, onCompleted);

      const classDecoratorFn = wrappedDecorator('test-queue');
      classDecoratorFn(mockProcessor);

      await expect(mockProcessor.prototype.process({ id: '1' })).rejects.toThrow(error);

      // Span SHOULD be ended by process() — no failed handler defined
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should not end span in process() when failed handler is defined and process throws', async () => {
      const error = new Error('Test error');
      const originalProcess = vi.fn().mockRejectedValue(error);
      const onFailed = vi.fn();

      mockProcessor = class TestProcessor {};
      mockProcessor.prototype.process = originalProcess;
      mockProcessor.prototype.onFailed = onFailed;
      Reflect.defineMetadata(ON_WORKER_EVENT_METADATA, { eventName: 'failed' }, onFailed);

      const classDecoratorFn = wrappedDecorator('test-queue');
      classDecoratorFn(mockProcessor);

      await expect(mockProcessor.prototype.process({ id: '1' })).rejects.toThrow(error);

      // Span should NOT be ended by process() — failed handler will end it
      expect(mockSpan.end).not.toHaveBeenCalled();
    });
  });

  describe('Lifecycle method wrapping', () => {
    let wrappedDecorator: any;
    let mockClassDecorator: vi.Mock;
    let mockProcessor: any;

    beforeEach(() => {
      mockClassDecorator = vi.fn().mockImplementation(() => {
        return (target: any) => target;
      });

      const moduleDef = instrumentation.init();
      const file = moduleDef.files[0];
      const moduleExports = { Processor: mockClassDecorator };
      file?.patch(moduleExports);
      wrappedDecorator = moduleExports.Processor;
    });

    it('should wrap methods with @OnWorkerEvent metadata', () => {
      const originalProcess = vi.fn().mockResolvedValue('result');
      const onCompleted = vi.fn();

      mockProcessor = class TestProcessor {};
      mockProcessor.prototype.process = originalProcess;
      mockProcessor.prototype.onCompleted = onCompleted;
      Reflect.defineMetadata(ON_WORKER_EVENT_METADATA, { eventName: 'completed' }, onCompleted);

      const classDecoratorFn = wrappedDecorator('test-queue');
      classDecoratorFn(mockProcessor);

      expect(mockProcessor.prototype.onCompleted).not.toBe(onCompleted);
      expect(mockProcessor.prototype.onCompleted.__SENTRY_INSTRUMENTED__).toBe(true);
    });

    it('should not wrap methods without @OnWorkerEvent metadata', () => {
      const originalProcess = vi.fn().mockResolvedValue('result');
      const plainMethod = vi.fn();

      mockProcessor = class TestProcessor {};
      mockProcessor.prototype.process = originalProcess;
      mockProcessor.prototype.plainMethod = plainMethod;

      const classDecoratorFn = wrappedDecorator('test-queue');
      classDecoratorFn(mockProcessor);

      expect(mockProcessor.prototype.plainMethod).toBe(plainMethod);
    });

    it('should call withIsolationScope in lifecycle handler', () => {
      const originalProcess = vi.fn().mockResolvedValue('result');
      const onCompleted = vi.fn();

      mockProcessor = class TestProcessor {};
      mockProcessor.prototype.process = originalProcess;
      mockProcessor.prototype.onCompleted = onCompleted;
      Reflect.defineMetadata(ON_WORKER_EVENT_METADATA, { eventName: 'completed' }, onCompleted);

      const classDecoratorFn = wrappedDecorator('test-queue');
      classDecoratorFn(mockProcessor);

      mockProcessor.prototype.onCompleted({ id: '1' });

      expect(core.withIsolationScope).toHaveBeenCalled();
    });

    it('should reuse stored scope from process() in terminal handler', async () => {
      const originalProcess = vi.fn().mockResolvedValue('result');
      const onCompleted = vi.fn();

      mockProcessor = class TestProcessor {};
      mockProcessor.prototype.process = originalProcess;
      mockProcessor.prototype.onCompleted = onCompleted;
      Reflect.defineMetadata(ON_WORKER_EVENT_METADATA, { eventName: 'completed' }, onCompleted);

      const classDecoratorFn = wrappedDecorator('test-queue');
      classDecoratorFn(mockProcessor);

      const job = { id: '1' };

      // process() stores the scope on the job
      await mockProcessor.prototype.process(job);

      // completed handler should reuse the stored scope
      mockProcessor.prototype.onCompleted(job);

      // withIsolationScope should have been called with the stored scope (2-arg overload)
      const calls = (core.withIsolationScope as any).mock.calls;
      const completedCall = calls[calls.length - 1];
      // 2-arg call means scope was reused
      expect(completedCall).toHaveLength(2);
    });

    it('should end span in terminal handler', async () => {
      const originalProcess = vi.fn().mockResolvedValue('result');
      const onCompleted = vi.fn();

      mockProcessor = class TestProcessor {};
      mockProcessor.prototype.process = originalProcess;
      mockProcessor.prototype.onCompleted = onCompleted;
      Reflect.defineMetadata(ON_WORKER_EVENT_METADATA, { eventName: 'completed' }, onCompleted);

      const classDecoratorFn = wrappedDecorator('test-queue');
      classDecoratorFn(mockProcessor);

      const job = { id: '1' };

      await mockProcessor.prototype.process(job);
      expect(mockSpan.end).not.toHaveBeenCalled();

      mockProcessor.prototype.onCompleted(job);
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should capture exceptions in lifecycle handlers', () => {
      const originalProcess = vi.fn().mockResolvedValue('result');
      const error = new Error('Lifecycle error');
      const onCompleted = vi.fn().mockImplementation(() => {
        throw error;
      });

      mockProcessor = class TestProcessor {};
      mockProcessor.prototype.process = originalProcess;
      mockProcessor.prototype.onCompleted = onCompleted;
      Reflect.defineMetadata(ON_WORKER_EVENT_METADATA, { eventName: 'completed' }, onCompleted);

      const classDecoratorFn = wrappedDecorator('test-queue');
      classDecoratorFn(mockProcessor);

      expect(() => mockProcessor.prototype.onCompleted({ id: '1' })).toThrow(error);
      expect(core.captureException).toHaveBeenCalledWith(error, {
        mechanism: {
          handled: false,
          type: 'auto.queue.nestjs.bullmq',
        },
      });
    });

    it('should not double-wrap lifecycle methods', () => {
      const originalProcess = vi.fn().mockResolvedValue('result');
      const onCompleted = vi.fn();

      mockProcessor = class TestProcessor {};
      mockProcessor.prototype.process = originalProcess;
      mockProcessor.prototype.onCompleted = onCompleted;
      Reflect.defineMetadata(ON_WORKER_EVENT_METADATA, { eventName: 'completed' }, onCompleted);

      const classDecoratorFn = wrappedDecorator('test-queue');
      classDecoratorFn(mockProcessor);

      const wrappedOnCompleted = mockProcessor.prototype.onCompleted;

      // Apply decorator again (simulate double application)
      // Need a fresh process to avoid __SENTRY_INSTRUMENTED__ on process too
      mockProcessor.prototype.process = vi.fn().mockResolvedValue('result');
      const classDecoratorFn2 = wrappedDecorator('test-queue');
      classDecoratorFn2(mockProcessor);

      expect(mockProcessor.prototype.onCompleted).toBe(wrappedOnCompleted);
    });

    it('should create scope on job from active handler and reuse in process()', async () => {
      const originalProcess = vi.fn().mockResolvedValue('result');
      const onActive = vi.fn();
      const onCompleted = vi.fn();

      mockProcessor = class TestProcessor {};
      mockProcessor.prototype.process = originalProcess;
      mockProcessor.prototype.onActive = onActive;
      mockProcessor.prototype.onCompleted = onCompleted;
      Reflect.defineMetadata(ON_WORKER_EVENT_METADATA, { eventName: 'active' }, onActive);
      Reflect.defineMetadata(ON_WORKER_EVENT_METADATA, { eventName: 'completed' }, onCompleted);

      const classDecoratorFn = wrappedDecorator('test-queue');
      classDecoratorFn(mockProcessor);

      const job = { id: '1' };

      // Active fires first (before process) — creates and stores scope on job
      mockProcessor.prototype.onActive(job);

      // Process should reuse the stored scope (2-arg withIsolationScope)
      await mockProcessor.prototype.process(job);

      const calls = (core.withIsolationScope as any).mock.calls;
      const processCall = calls[calls.length - 1];
      // 2-arg call means process() found and reused the scope from active
      expect(processCall).toHaveLength(2);
    });
  });
});
