import 'reflect-metadata';
import * as core from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SentryNestBullMQInstrumentation } from '../../src/integrations/sentry-nest-bullmq-instrumentation';

describe('BullMQInstrumentation', () => {
  let instrumentation: SentryNestBullMQInstrumentation;

  beforeEach(() => {
    instrumentation = new SentryNestBullMQInstrumentation();
    vi.spyOn(core, 'captureException');
    vi.spyOn(core, 'withIsolationScope').mockImplementation(callback => {
      return (callback as () => unknown)();
    });
    vi.spyOn(core, 'startSpan').mockImplementation((_, callback) => {
      return (callback as () => unknown)();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    it('should call withIsolationScope and startSpan on process execution', async () => {
      const originalProcess = vi.fn().mockResolvedValue('result');

      mockProcessor = class TestProcessor {
        process = originalProcess;
      };
      mockProcessor.prototype.process = originalProcess;

      const classDecoratorFn = wrappedDecorator('test-queue');
      classDecoratorFn(mockProcessor);

      await mockProcessor.prototype.process();

      expect(core.withIsolationScope).toHaveBeenCalled();
      expect(core.startSpan).toHaveBeenCalledWith(
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

      await expect(mockProcessor.prototype.process()).rejects.toThrow(error);
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
      mockProcessor.prototype.__SENTRY_INTERNAL__ = true;

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

      await mockProcessor.prototype.process();

      expect(core.startSpan).toHaveBeenCalledWith(
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
  });
});
