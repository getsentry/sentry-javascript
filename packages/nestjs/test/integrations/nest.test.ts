import 'reflect-metadata';
import * as core from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPatched } from '../../src/integrations/helpers';
import { SentryNestEventInstrumentation } from '../../src/integrations/sentry-nest-event-instrumentation';
import type { InjectableTarget, OnEventTarget } from '../../src/integrations/types';

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
    let mockOnEvent: vi.Mock;
    let mockTarget: OnEventTarget;

    beforeEach(() => {
      instrumentation = new SentryNestEventInstrumentation();
      // Mock OnEvent to return a function that applies the descriptor
      mockOnEvent = vi.fn().mockImplementation(() => {
        return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
          return descriptor;
        };
      });
      mockTarget = {
        name: 'TestClass',
        prototype: {},
      } as OnEventTarget;
      vi.spyOn(core, 'startSpan');
      vi.spyOn(core, 'captureException');
    });

    afterEach(() => {
      vi.restoreAllMocks();
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
      let originalHandler: vi.Mock;

      beforeEach(() => {
        originalHandler = vi.fn().mockResolvedValue('result');
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

        expect(core.startSpan).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'event test.event',
          }),
          expect.any(Function),
        );
        expect(originalHandler).toHaveBeenCalled();
      });

      it('should wrap symbol event handlers', async () => {
        const decorated = wrappedOnEvent(Symbol('test.event'));
        decorated(mockTarget, 'testMethod', descriptor);

        await descriptor.value();

        expect(core.startSpan).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'event Symbol(test.event)',
          }),
          expect.any(Function),
        );
        expect(originalHandler).toHaveBeenCalled();
      });

      it('should wrap string array event handlers', async () => {
        const decorated = wrappedOnEvent(['test.event1', 'test.event2']);
        decorated(mockTarget, 'testMethod', descriptor);

        await descriptor.value();

        expect(core.startSpan).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'event test.event1,test.event2',
          }),
          expect.any(Function),
        );
        expect(originalHandler).toHaveBeenCalled();
      });

      it('should wrap symbol array event handlers', async () => {
        const decorated = wrappedOnEvent([Symbol('test.event1'), Symbol('test.event2')]);
        decorated(mockTarget, 'testMethod', descriptor);

        await descriptor.value();

        expect(core.startSpan).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'event Symbol(test.event1),Symbol(test.event2)',
          }),
          expect.any(Function),
        );
        expect(originalHandler).toHaveBeenCalled();
      });

      it('should wrap mixed type array event handlers', async () => {
        const decorated = wrappedOnEvent([Symbol('test.event1'), 'test.event2', Symbol('test.event3')]);
        decorated(mockTarget, 'testMethod', descriptor);

        await descriptor.value();

        expect(core.startSpan).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'event Symbol(test.event1),test.event2,Symbol(test.event3)',
          }),
          expect.any(Function),
        );
        expect(originalHandler).toHaveBeenCalled();
      });

      it('should capture exceptions and rethrow', async () => {
        const error = new Error('Test error');
        originalHandler.mockRejectedValue(error);

        const decorated = wrappedOnEvent('test.event');
        decorated(mockTarget, 'testMethod', descriptor);

        await expect(descriptor.value()).rejects.toThrow(error);
        expect(core.captureException).toHaveBeenCalledWith(error, {
          mechanism: {
            handled: false,
            type: 'auto.event.nestjs',
          },
        });
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
