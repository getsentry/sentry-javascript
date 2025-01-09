import { afterEach, describe, expect, it, test, vi } from 'vitest';

import { setCurrentClient } from '@sentry/browser';

import { attachErrorHandler } from '../src/errorhandler';
import type { Operation, Options, ViewModel, Vue } from '../src/types';
import { generateComponentTrace } from '../src/vendor/components';

describe('attachErrorHandler', () => {
  describe('attach data to captureException', () => {
    afterEach(() => {
      vi.resetAllMocks();
      // we need timers to still call captureException wrapped inside setTimeout after the error throws
      vi.useRealTimers();
    });

    describe("given I don't want to `attachProps`", () => {
      test('no `propsData` is added to the metadata', () => {
        const t = testHarness({
          enableWarnHandler: false,
          attachProps: false,
          vm: null,
          enableConsole: true,
        });

        vi.useFakeTimers();
        expect(() => t.run()).toThrow(DummyError);
        vi.runAllTimers();

        // assert
        t.expect.errorToHaveBeenCaptured().withoutProps();
        t.expect.errorToHaveBeenCaptured().withMechanismMetadata({ handled: false, type: 'vue' });
      });
    });

    describe('given I want to `attachProps`', () => {
      describe('when an error is caught', () => {
        describe('and `vm` is not defined', () => {
          test('no `propsData` is added to the metadata', () => {
            // arrange
            const t = testHarness({
              vm: null,
              attachProps: true,
            });

            // act
            vi.useFakeTimers();
            expect(() => t.run()).toThrow(DummyError);
            vi.runAllTimers();

            // assert
            t.expect.errorToHaveBeenCaptured().withoutProps();
            t.expect.errorToHaveBeenCaptured().withMechanismMetadata({ handled: false, type: 'vue' });
          });
        });

        describe('and `vm` is defined', () => {
          describe('and `vm.$options` nor `vm.$props` are defined', () => {
            test('no `propsData` is added to the metadata', () => {
              // arrange
              const t = testHarness({
                vm: {},
                attachProps: true,
              });

              // act
              vi.useFakeTimers();
              expect(() => t.run()).toThrow(DummyError);
              vi.runAllTimers();

              // assert
              t.expect.errorToHaveBeenCaptured().withoutProps();
            });
          });

          describe('and `vm.$options` is defined but not `vm.$options.propsData`', () => {
            test('no `propsData` is added to the metadata', () => {
              // arrange
              const t = testHarness({
                vm: {
                  $options: {},
                },
                attachProps: true,
              });

              // act
              vi.useFakeTimers();
              expect(() => t.run()).toThrow(DummyError);
              vi.runAllTimers();

              // assert
              t.expect.errorToHaveBeenCaptured().withoutProps();
            });
          });

          describe('and both `vm.$options` and `vm.$options.propsData` are defined', () => {
            test.each([[{}], [{ stubProp: 'stubData' }]])('`propsData` is added to the metadata', props => {
              // arrange
              const t = testHarness({
                vm: {
                  $props: props,
                },
                attachProps: true,
              });

              // act
              vi.useFakeTimers();
              expect(() => t.run()).toThrow(DummyError);
              vi.runAllTimers();

              // assert
              t.expect.errorToHaveBeenCaptured().withProps(props);
            });
          });

          describe('and `vm.$props` is defined', () => {
            test.each([[{}], [{ stubProp: 'stubData' }]])('`propsData` is added to the metadata', props => {
              // arrange
              const t = testHarness({
                vm: {
                  $options: {
                    propsData: props,
                  },
                },
                attachProps: true,
              });

              // act
              vi.useFakeTimers();
              expect(() => t.run()).toThrow(DummyError);
              vi.runAllTimers();

              // assert
              t.expect.errorToHaveBeenCaptured().withProps(props);
            });
          });
        });
      });
    });

    describe('attach mechanism metadata', () => {
      it('should mark error as unhandled and capture correct metadata', () => {
        // arrange
        const t = testHarness({ vm: null });

        // act
        vi.useFakeTimers();
        expect(() => t.run()).toThrow(DummyError);
        vi.runAllTimers();

        // assert
        t.expect.errorToHaveBeenCaptured().withMechanismMetadata({ handled: false, type: 'vue' });
      });

      it('should mark error as handled and properly delegate to error handler', () => {
        // arrange
        const vm = {
          $options: {
            name: 'stub-vm',
          },
        };
        const t = testHarness({
          enableErrorHandler: true,
          enableConsole: true,
          vm,
        });

        // act
        t.run();

        // assert
        t.expect.errorHandlerSpy.toHaveBeenCalledWith(expect.any(Error), vm, 'stub-lifecycle-hook');
        t.expect.errorToHaveBeenCaptured().withMechanismMetadata({ handled: true, type: 'vue' });
      });
    });
  });

  describe('error re-throwing and logging', () => {
    afterEach(() => {
      vi.resetAllMocks();
    });

    describe('error re-throwing', () => {
      it('should re-throw error when no error handler exists', () => {
        const t = testHarness({
          enableErrorHandler: false,
          enableConsole: true,
          vm: { $options: { name: 'stub-vm' } },
        });

        expect(() => t.run()).toThrow(DummyError);
      });

      it('should call user-defined error handler when provided', () => {
        const vm = { $options: { name: 'stub-vm' } };
        const t = testHarness({
          enableErrorHandler: true,
          enableConsole: true,
          vm,
        });

        t.run();

        t.expect.errorHandlerSpy.toHaveBeenCalledWith(expect.any(Error), vm, 'stub-lifecycle-hook');
      });
    });

    describe('error logging enabled', () => {
      it('should use console.error when an `errorHandler` is available', () => {
        const t = testHarness({
          vm: null,
          logErrors: true,
          enableConsole: true,
          enableErrorHandler: true,
          enableWarnHandler: false,
        });

        t.run();

        t.expect.consoleErrorSpy.toHaveBeenCalledWith(
          '[Vue warn]: Error in stub-lifecycle-hook: "DummyError: just an error"',
        );
      });

      it('should prefer warn handler over console.error when both are available', () => {
        const vm = { $options: { name: 'stub-vm' } };
        const t = testHarness({
          vm,
          logErrors: true,
          enableErrorHandler: true,
          enableWarnHandler: true,
          enableConsole: true,
        });

        t.run();

        t.expect.consoleErrorSpy.not.toHaveBeenCalled();
        t.expect.warnHandlerSpy.toHaveBeenCalledWith(
          'Error in stub-lifecycle-hook: "DummyError: just an error"',
          vm,
          generateComponentTrace(vm as ViewModel),
        );
      });

      it('should throw error when no handler is available', () => {
        const vm = { $options: { name: 'stub-vm' } };
        const t = testHarness({
          vm,
          logErrors: true,
          silent: true,
        });

        expect(() => t.run()).toThrow(DummyError);
      });

      it('should fallback to console.error when warn handler is not available', () => {
        const t = testHarness({
          vm: null,
          logErrors: true,
          enableConsole: true,
          enableErrorHandler: true,
        });

        t.run();

        t.expect.consoleErrorSpy.toHaveBeenCalledWith(
          '[Vue warn]: Error in stub-lifecycle-hook: "DummyError: just an error"',
        );
      });
    });
  });
});

type TestHarnessOpts = {
  // I don't need everything in the tests
  vm: Partial<ViewModel> | null;
  enableWarnHandler?: boolean;
  enableErrorHandler?: boolean;
  enableConsole?: boolean;
  silent?: boolean;
  attachProps?: boolean;
  logErrors?: boolean;
};

class DummyError extends Error {
  constructor() {
    super('just an error');
    this.name = 'DummyError';
  }
}

const testHarness = ({
  silent,
  attachProps,
  logErrors,
  enableWarnHandler,
  enableErrorHandler,
  enableConsole,
  vm,
}: TestHarnessOpts) => {
  vi.useFakeTimers();
  const providedErrorHandlerSpy = vi.fn();
  const warnHandlerSpy = vi.fn();
  const consoleErrorSpy = vi.fn();

  const client: any = {
    captureException: vi.fn(async () => Promise.resolve()),
  };
  setCurrentClient(client);

  const app: Vue = {
    config: {
      silent: !!silent,
    },
    mixin: vi.fn(),
  };

  if (enableErrorHandler) {
    app.config.errorHandler = providedErrorHandlerSpy;
  }

  if (enableWarnHandler) {
    app.config.warnHandler = warnHandlerSpy;
  }

  /* eslint-disable no-global-assign */
  if (enableConsole) {
    // I need to re-assign the whole console
    // because at some point it can be set to undefined
    // @ts-expect-error for the sake of testing
    console = { error: consoleErrorSpy };
  } else {
    // @ts-expect-error for the sake of testing
    console = undefined;
  }
  /* eslint-enable no-global-assign */

  const options: Options = {
    attachProps: !!attachProps,
    logErrors: !!logErrors,
    tracingOptions: {},
    trackComponents: [],
    timeout: 0,
    hooks: [] as Operation[],
  };

  return {
    run: () => {
      // inits the error handler
      attachErrorHandler(app, options);

      // calls the error handler
      app.config.errorHandler(new DummyError(), vm, 'stub-lifecycle-hook');

      // and waits for internal timers
      vi.runAllTimers();
    },
    expect: {
      errorHandlerSpy: expect(providedErrorHandlerSpy),
      warnHandlerSpy: expect(warnHandlerSpy),
      consoleErrorSpy: expect(consoleErrorSpy),
      errorToHaveBeenCaptured: () => {
        const captureExceptionSpy = client.captureException;
        expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
        const error = captureExceptionSpy.mock.calls[0][0];
        const contexts = captureExceptionSpy.mock.calls[0][1]?.captureContext.contexts;
        const mechanismMetadata = captureExceptionSpy.mock.calls[0][1]?.mechanism;

        expect(error).toBeInstanceOf(DummyError);

        return {
          withProps: (props: Record<string, unknown>) => {
            expect(contexts).toHaveProperty('vue.propsData', props);
          },
          withoutProps: () => {
            expect(contexts).not.toHaveProperty('vue.propsData');
          },
          withMechanismMetadata: (mechanism: { handled: boolean; type: 'vue' }) => {
            expect(mechanismMetadata).toEqual(mechanism);
          },
        };
      },
    },
  };
};
