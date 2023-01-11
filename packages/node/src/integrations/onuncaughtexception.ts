import type { Scope } from '@sentry/core';
import { getCurrentHub } from '@sentry/core';
import type { Integration } from '@sentry/types';
import { logger } from '@sentry/utils';

import type { NodeClient } from '../client';
import { logAndExitProcess } from './utils/errorhandling';

type OnFatalErrorHandler = (firstError: Error, secondError?: Error) => void;

// CAREFUL: Please think twice before updating the way _options looks because the Next.js SDK depends on it in `index.server.ts`
interface OnUncaughtExceptionOptions {
  // TODO(v8): Evaluate whether we should switch the default behaviour here.
  // Also, we can evaluate using https://nodejs.org/api/process.html#event-uncaughtexceptionmonitor per default, and
  // falling back to current behaviour when that's not available.
  /**
   * Controls if the SDK should register a handler to exit the process on uncaught errors:
   * - `true`: The SDK will exit the process on all uncaught errors.
   * - `false`: The SDK will only exit the process when there are no other `uncaughtException` handlers attached.
   *
   * Default: `true`
   */
  exitEvenIfOtherHandlersAreRegistered: boolean;

  /**
   * This is called when an uncaught error would cause the process to exit.
   *
   * @param firstError Uncaught error causing the process to exit
   * @param secondError Will be set if the handler was called multiple times. This can happen either because
   * `onFatalError` itself threw, or because an independent error happened somewhere else while `onFatalError`
   * was running.
   */
  onFatalError?(this: void, firstError: Error, secondError?: Error): void;
}

/** Global Exception handler */
export class OnUncaughtException implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'OnUncaughtException';

  /**
   * @inheritDoc
   */
  public name: string = OnUncaughtException.id;

  /**
   * @inheritDoc
   */
  public readonly handler: (error: Error) => void = this._makeErrorHandler();

  // CAREFUL: Please think twice before updating the way _options looks because the Next.js SDK depends on it in `index.server.ts`
  private readonly _options: OnUncaughtExceptionOptions;

  /**
   * @inheritDoc
   */
  public constructor(options: Partial<OnUncaughtExceptionOptions> = {}) {
    this._options = {
      exitEvenIfOtherHandlersAreRegistered: true,
      ...options,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    global.process.on('uncaughtException', this.handler);
  }

  /**
   * @hidden
   */
  private _makeErrorHandler(): (error: Error) => void {
    const timeout = 2000;
    let caughtFirstError: boolean = false;
    let caughtSecondError: boolean = false;
    let calledFatalError: boolean = false;
    let firstError: Error;

    return (error: Error): void => {
      let onFatalError: OnFatalErrorHandler = logAndExitProcess;
      const client = getCurrentHub().getClient<NodeClient>();

      if (this._options.onFatalError) {
        onFatalError = this._options.onFatalError;
      } else if (client && client.getOptions().onFatalError) {
        onFatalError = client.getOptions().onFatalError as OnFatalErrorHandler;
      }

      // Attaching a listener to `uncaughtException` will prevent the node process from exiting. We generally do not
      // want to alter this behaviour so we check for other listeners that users may have attached themselves and adjust
      // exit behaviour of the SDK accordingly:
      // - If other listeners are attached, do not exit.
      // - If the only listener attached is ours, exit.
      const userProvidedListenersCount = global.process
        .listeners('uncaughtException')
        .reduce<number>((acc, listener) => {
          if (
            listener.name === 'domainUncaughtExceptionClear' || // as soon as we're using domains this listener is attached by node itself
            listener === this.handler // filter the handler we registered ourselves)
          ) {
            return acc;
          } else {
            return acc + 1;
          }
        }, 0);

      const processWouldExit = userProvidedListenersCount === 0;
      const shouldApplyFatalHandlingLogic = this._options.exitEvenIfOtherHandlersAreRegistered || processWouldExit;

      if (!caughtFirstError) {
        const hub = getCurrentHub();

        // this is the first uncaught error and the ultimate reason for shutting down
        // we want to do absolutely everything possible to ensure it gets captured
        // also we want to make sure we don't go recursion crazy if more errors happen after this one
        firstError = error;
        caughtFirstError = true;

        if (hub.getIntegration(OnUncaughtException)) {
          hub.withScope((scope: Scope) => {
            scope.setLevel('fatal');
            hub.captureException(error, {
              originalException: error,
              data: { mechanism: { handled: false, type: 'onuncaughtexception' } },
            });
            if (!calledFatalError && shouldApplyFatalHandlingLogic) {
              calledFatalError = true;
              onFatalError(error);
            }
          });
        } else {
          if (!calledFatalError && shouldApplyFatalHandlingLogic) {
            calledFatalError = true;
            onFatalError(error);
          }
        }
      } else {
        if (shouldApplyFatalHandlingLogic) {
          if (calledFatalError) {
            // we hit an error *after* calling onFatalError - pretty boned at this point, just shut it down
            __DEBUG_BUILD__ &&
              logger.warn(
                'uncaught exception after calling fatal error shutdown callback - this is bad! forcing shutdown',
              );
            logAndExitProcess(error);
          } else if (!caughtSecondError) {
            // two cases for how we can hit this branch:
            //   - capturing of first error blew up and we just caught the exception from that
            //     - quit trying to capture, proceed with shutdown
            //   - a second independent error happened while waiting for first error to capture
            //     - want to avoid causing premature shutdown before first error capture finishes
            // it's hard to immediately tell case 1 from case 2 without doing some fancy/questionable domain stuff
            // so let's instead just delay a bit before we proceed with our action here
            // in case 1, we just wait a bit unnecessarily but ultimately do the same thing
            // in case 2, the delay hopefully made us wait long enough for the capture to finish
            // two potential nonideal outcomes:
            //   nonideal case 1: capturing fails fast, we sit around for a few seconds unnecessarily before proceeding correctly by calling onFatalError
            //   nonideal case 2: case 2 happens, 1st error is captured but slowly, timeout completes before capture and we treat second error as the sendErr of (nonexistent) failure from trying to capture first error
            // note that after hitting this branch, we might catch more errors where (caughtSecondError && !calledFatalError)
            //   we ignore them - they don't matter to us, we're just waiting for the second error timeout to finish
            caughtSecondError = true;
            setTimeout(() => {
              if (!calledFatalError) {
                // it was probably case 1, let's treat err as the sendErr and call onFatalError
                calledFatalError = true;
                onFatalError(firstError, error);
              } else {
                // it was probably case 2, our first error finished capturing while we waited, cool, do nothing
              }
            }, timeout); // capturing could take at least sendTimeout to fail, plus an arbitrary second for how long it takes to collect surrounding source etc
          }
        }
      }
    };
  }
}
