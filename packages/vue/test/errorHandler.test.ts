import { setCurrentClient } from '@sentry/browser';
import { afterEach, describe, expect, it, test, vi } from 'vitest';
import { attachErrorHandler } from '../src/errorhandler';
import type { Operation, Options, ViewModel, Vue } from '../src/types';

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
        t.expect
          .errorToHaveBeenCaptured()
          .withMechanismMetadata({ handled: false, type: 'auto.function.vue.error_handler' });
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
            t.expect
              .errorToHaveBeenCaptured()
              .withMechanismMetadata({ handled: false, type: 'auto.function.vue.error_handler' });
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

            test('`propsData` is added, if no options are provided to `attachErrorHandler`', () => {
              // arrange
              const props = { stubProp: 'stubData' };
              const t = testHarness({
                vm: {
                  $props: props,
                },
                optionsUndefined: true,
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
        t.expect
          .errorToHaveBeenCaptured()
          .withMechanismMetadata({ handled: false, type: 'auto.function.vue.error_handler' });
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
        t.expect
          .errorToHaveBeenCaptured()
          .withMechanismMetadata({ handled: true, type: 'auto.function.vue.error_handler' });
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
  optionsUndefined?: boolean;
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
  enableWarnHandler,
  enableErrorHandler,
  enableConsole,
  vm,
  optionsUndefined = false,
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

  const options: Options | undefined = optionsUndefined
    ? undefined
    : {
        attachProps: !!attachProps,
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
          withMechanismMetadata: (mechanism: { handled: boolean; type: 'auto.function.vue.error_handler' }) => {
            expect(mechanismMetadata).toEqual(mechanism);
          },
        };
      },
    },
  };
};
