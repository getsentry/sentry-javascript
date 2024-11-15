import * as core from '@sentry/core';
import { isPatched } from '../../../src/integrations/tracing/nest/helpers';
import { SentryNestEventInstrumentation } from '../../../src/integrations/tracing/nest/sentry-nest-event-instrumentation';
import type { InjectableTarget } from '../../../src/integrations/tracing/nest/types';
import type { OnEventTarget } from '../../../src/integrations/tracing/nest/types';

describe('Nest', () => {
  describe('isPatched', () => {
    it('should return true if target is already patched', () => {
      const target = { name: 'TestTarget', sentryPatched: true, prototype: {} };
      expect(isPatched(target)).toBe(true);
    });

    it('should add the sentryPatched property and return false if target is not patched', () => {
      const target: InjectableTarget = { name: 'TestTarget', prototype: {} };
      expect(isPatched(target)).toBe(false);
      expect(target.sentryPatched).toBe(true);
    });
  });

  describe('EventInstrumentation', () => {
    let instrumentation: SentryNestEventInstrumentation;
    let mockOnEvent: jest.Mock;
    let mockTarget: OnEventTarget;

    beforeEach(() => {
      instrumentation = new SentryNestEventInstrumentation();
      // Mock OnEvent to return a function that applies the descriptor
      mockOnEvent = jest.fn().mockImplementation(() => {
        return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
          return descriptor;
        };
      });
      mockTarget = {
        name: 'TestClass',
        prototype: {},
      } as OnEventTarget;
      jest.spyOn(core, 'startSpan');
      jest.spyOn(core, 'captureException');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    describe('init()', () => {
      it('should return module definition with correct component name', () => {
        const moduleDef = instrumentation.init();
        expect(moduleDef.name).toBe('@nestjs/event-emitter');
      });
    });

    describe('OnEvent decorator wrapping', () => {
      let wrappedOnEvent: any;
      let descriptor: PropertyDescriptor;
      let originalHandler: jest.Mock;

      beforeEach(() => {
        originalHandler = jest.fn().mockResolvedValue('result');
        descriptor = {
          value: originalHandler,
        };

        const moduleDef = instrumentation.init();
        const onEventFile = moduleDef.files[0];
        const moduleExports = { OnEvent: mockOnEvent };
        onEventFile?.patch(moduleExports);
        wrappedOnEvent = moduleExports.OnEvent;
      });

      it('should wrap string event handlers', async () => {
        const decorated = wrappedOnEvent('test.event');
        decorated(mockTarget, 'testMethod', descriptor);

        await descriptor.value();

        expect(core.startSpan).toHaveBeenCalled();
        expect(originalHandler).toHaveBeenCalled();
      });

      it('should wrap array event handlers', async () => {
        const decorated = wrappedOnEvent(['test.event1', 'test.event2']);
        decorated(mockTarget, 'testMethod', descriptor);

        await descriptor.value();

        expect(core.startSpan).toHaveBeenCalled();
        expect(originalHandler).toHaveBeenCalled();
      });

      it('should capture exceptions and rethrow', async () => {
        const error = new Error('Test error');
        originalHandler.mockRejectedValue(error);

        const decorated = wrappedOnEvent('test.event');
        decorated(mockTarget, 'testMethod', descriptor);

        await expect(descriptor.value()).rejects.toThrow(error);
        expect(core.captureException).toHaveBeenCalledWith(error);
      });

      it('should skip wrapping for internal Sentry handlers', () => {
        const internalTarget = {
          ...mockTarget,
          __SENTRY_INTERNAL__: true,
        };

        const decorated = wrappedOnEvent('test.event');
        decorated(internalTarget, 'testMethod', descriptor);

        expect(descriptor.value).toBe(originalHandler);
      });
    });
  });
});
