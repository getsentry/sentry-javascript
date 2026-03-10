import 'reflect-metadata';
import * as core from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SentryNestScheduleInstrumentation } from '../../src/integrations/sentry-nest-schedule-instrumentation';
import type { ScheduleDecoratorTarget } from '../../src/integrations/types';

describe('ScheduleInstrumentation', () => {
  let instrumentation: SentryNestScheduleInstrumentation;
  let mockTarget: ScheduleDecoratorTarget;

  beforeEach(() => {
    instrumentation = new SentryNestScheduleInstrumentation();
    mockTarget = {
      name: 'TestClass',
    } as ScheduleDecoratorTarget;
    vi.spyOn(core, 'captureException');
    vi.spyOn(core, 'withIsolationScope').mockImplementation(callback => {
      return (callback as () => unknown)();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe.each([
    { decoratorName: 'Cron', fileIndex: 0, mechanismType: 'auto.schedule.nestjs.cron' },
    { decoratorName: 'Interval', fileIndex: 1, mechanismType: 'auto.schedule.nestjs.interval' },
    { decoratorName: 'Timeout', fileIndex: 2, mechanismType: 'auto.schedule.nestjs.timeout' },
  ])('$decoratorName decorator wrapping', ({ decoratorName, fileIndex, mechanismType }) => {
    let wrappedDecorator: any;
    let descriptor: PropertyDescriptor;
    let originalHandler: vi.Mock;
    let mockDecorator: vi.Mock;

    beforeEach(() => {
      originalHandler = vi.fn(function testHandler() {
        return 'result';
      });
      descriptor = {
        value: originalHandler,
      };

      mockDecorator = vi.fn().mockImplementation(() => {
        return (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) => {
          return descriptor;
        };
      });

      const moduleDef = instrumentation.init();
      const file = moduleDef.files[fileIndex];
      const moduleExports = { [decoratorName]: mockDecorator };
      file?.patch(moduleExports);
      wrappedDecorator = moduleExports[decoratorName];
    });

    it('should call withIsolationScope on handler execution', () => {
      const decorated = wrappedDecorator('test-arg');
      decorated(mockTarget, 'testMethod', descriptor);

      descriptor.value();

      expect(core.withIsolationScope).toHaveBeenCalled();
      expect(originalHandler).toHaveBeenCalled();
    });

    it('should capture sync exceptions and rethrow', () => {
      const error = new Error('Test error');
      originalHandler.mockImplementation(() => {
        throw error;
      });

      const decorated = wrappedDecorator('test-arg');
      decorated(mockTarget, 'testMethod', descriptor);

      expect(() => descriptor.value()).toThrow(error);
      expect(core.captureException).toHaveBeenCalledWith(error, {
        mechanism: {
          handled: false,
          type: mechanismType,
        },
      });
    });

    it('should capture async exceptions and rethrow', async () => {
      const error = new Error('Test error');
      originalHandler.mockReturnValue(Promise.reject(error));

      const decorated = wrappedDecorator('test-arg');
      decorated(mockTarget, 'testMethod', descriptor);

      await expect(descriptor.value()).rejects.toThrow(error);
      expect(core.captureException).toHaveBeenCalledWith(error, {
        mechanism: {
          handled: false,
          type: mechanismType,
        },
      });
    });

    it('should skip wrapping for internal Sentry handlers', () => {
      const internalTarget = {
        ...mockTarget,
        __SENTRY_INTERNAL__: true,
      };

      const decorated = wrappedDecorator('test-arg');
      decorated(internalTarget, 'testMethod', descriptor);

      expect(descriptor.value).toBe(originalHandler);
    });

    it('should skip wrapping if already instrumented', () => {
      originalHandler.__SENTRY_INSTRUMENTED__ = true;

      const decorated = wrappedDecorator('test-arg');
      decorated(mockTarget, 'testMethod', descriptor);

      expect(descriptor.value).toBe(originalHandler);
    });

  });
});
