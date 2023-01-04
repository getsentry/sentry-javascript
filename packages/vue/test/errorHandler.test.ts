import { getCurrentHub } from '@sentry/browser';

import { generateComponentTrace } from '../src/components';
import { attachErrorHandler } from '../src/errorhandler';
import type { Operation, Options, ViewModel, Vue } from '../src/types';

describe('attachErrorHandler', () => {
  describe('attachProps', () => {
    afterEach(() => {
      jest.resetAllMocks();
    });

    describe("given I don't want to `attachProps`", () => {
      test('no `propsData` is added to the metadata', () => {
        // arrange
        const t = testHarness({
          enableErrorHandler: false,
          enableWarnHandler: false,
          attachProps: false,
          vm: null,
        });

        // act
        t.run();

        // assert
        t.expect.errorToHaveBeenCaptured().withoutProps();
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
            t.run();

            // assert
            t.expect.errorToHaveBeenCaptured().withoutProps();
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
              t.run();

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
              t.run();

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
              t.run();

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
              t.run();

              // assert
              t.expect.errorToHaveBeenCaptured().withProps(props);
            });
          });
        });
      });
    });
  });

  describe('provided errorHandler', () => {
    describe('given I did not provide an `errorHandler`', () => {
      test('it is not called', () => {
        // arrange
        const t = testHarness({
          enableErrorHandler: false,
          vm: {
            $options: {
              name: 'stub-vm',
            },
          },
        });

        // act
        t.run();

        // assert
        t.expect.errorHandlerSpy.not.toHaveBeenCalled();
      });
    });

    describe('given I provided an `errorHandler`', () => {
      test('it is called', () => {
        // arrange
        const vm = {
          $options: {
            name: 'stub-vm',
          },
        };
        const t = testHarness({
          enableErrorHandler: true,
          vm,
        });

        // act
        t.run();

        // assert
        t.expect.errorHandlerSpy.toHaveBeenCalledWith(expect.any(Error), vm, 'stub-lifecycle-hook');
      });
    });
  });

  describe('error logging', () => {
    describe('given I disabled error logging', () => {
      describe('when an error is captured', () => {
        test('it logs nothing', () => {
          // arrange
          const vm = {
            $options: {
              name: 'stub-vm',
            },
          };
          const t = testHarness({
            enableWarnHandler: false,
            logErrors: false,
            vm,
          });

          // act
          t.run();

          // assert
          t.expect.consoleErrorSpy.not.toHaveBeenCalled();
          t.expect.warnHandlerSpy.not.toHaveBeenCalled();
        });
      });
    });

    describe('given I enabled error logging', () => {
      describe('when I provide a `warnHandler`', () => {
        describe('when a error is captured', () => {
          test.each([
            [
              'with wm',
              {
                $options: {
                  name: 'stub-vm',
                },
              },
              generateComponentTrace({
                $options: {
                  name: 'stub-vm',
                },
              } as ViewModel),
            ],
            ['without vm', null, ''],
          ])('it calls my `warnHandler` (%s)', (_, vm, expectedTrace) => {
            // arrange
            const t = testHarness({
              vm,
              logErrors: true,
              enableWarnHandler: true,
            });

            // act
            t.run();

            // assert
            t.expect.consoleErrorSpy.not.toHaveBeenCalled();
            t.expect.warnHandlerSpy.toHaveBeenCalledWith(
              'Error in stub-lifecycle-hook: "DummyError: just an error"',
              vm,
              expectedTrace,
            );
          });
        });
      });

      describe('when I do not provide a `warnHandler`', () => {
        describe("and I don't have a console", () => {
          test('it logs nothing', () => {
            // arrange
            const vm = {
              $options: {
                name: 'stub-vm',
              },
            };
            const t = testHarness({
              vm,
              logErrors: true,
              enableConsole: false,
            });

            // act
            t.run();

            // assert
            t.expect.consoleErrorSpy.not.toHaveBeenCalled();
          });
        });

        describe('and I silenced logging in Vue', () => {
          test('it logs nothing', () => {
            // arrange
            const vm = {
              $options: {
                name: 'stub-vm',
              },
            };
            const t = testHarness({
              vm,
              logErrors: true,
              silent: true,
            });

            // act
            t.run();

            // assert
            t.expect.consoleErrorSpy.not.toHaveBeenCalled();
          });
        });

        test('it call `console.error`', () => {
          // arrange
          const t = testHarness({
            vm: null,
            logErrors: true,
            enableConsole: true,
          });

          // act
          t.run();

          // assert
          t.expect.consoleErrorSpy.toHaveBeenCalledWith(
            '[Vue warn]: Error in stub-lifecycle-hook: "DummyError: just an error"',
          );
        });
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
  jest.useFakeTimers();
  const providedErrorHandlerSpy = jest.fn();
  const warnHandlerSpy = jest.fn();
  const consoleErrorSpy = jest.fn();

  const client: any = {
    captureException: jest.fn(async () => Promise.resolve()),
  };
  getCurrentHub().bindClient(client);

  const app: Vue = {
    config: {
      silent: !!silent,
    },
    mixin: jest.fn(),
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
    // @ts-ignore for the sake of testing
    console = { error: consoleErrorSpy };
  } else {
    // @ts-ignore for the sake of testing
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
      jest.runAllTimers();
    },
    expect: {
      errorHandlerSpy: expect(providedErrorHandlerSpy),
      warnHandlerSpy: expect(warnHandlerSpy),
      consoleErrorSpy: expect(consoleErrorSpy),
      errorToHaveBeenCaptured: () => {
        const captureExceptionSpy = client.captureException;
        expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
        const error = captureExceptionSpy.mock.calls[0][0];
        const contexts = captureExceptionSpy.mock.calls[0][2]._contexts;

        expect(error).toBeInstanceOf(DummyError);

        return {
          withProps: (props: Record<string, unknown>) => {
            expect(contexts).toHaveProperty('vue.propsData', props);
          },
          withoutProps: () => {
            expect(contexts).not.toHaveProperty('vue.propsData');
          },
        };
      },
    },
  };
};
