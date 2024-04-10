import { captureException, defineIntegration } from '@sentry/core';
import { getClient } from '@sentry/core';
import { logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import type { NodeClient } from '../sdk/client';
import { logAndExitProcess } from '../utils/errorhandling';

type OnFatalErrorHandler = (firstError: Error, secondError?: Error) => void;

type TaggedListener = NodeJS.UncaughtExceptionListener & {
  tag?: string;
};

interface OnUncaughtExceptionOptions {
  /**
   * Controls if the SDK should register a handler to exit the process on uncaught errors:
   * - `true`: The SDK will exit the process on all uncaught errors.
   * - `false`: The SDK will only exit the process when there are no other `uncaughtException` handlers attached.
   *
   * Default: `false`
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

const INTEGRATION_NAME = 'OnUncaughtException';

/**
 * Add a global exception handler.
 */
export const onUncaughtExceptionIntegration = defineIntegration((options: Partial<OnUncaughtExceptionOptions> = {}) => {
  const optionsWithDefaults = {
    exitEvenIfOtherHandlersAreRegistered: false,
    ...options,
  };

  return {
    name: INTEGRATION_NAME,
    setup(client: NodeClient) {
      global.process.on('uncaughtException', makeErrorHandler(client, optionsWithDefaults));
    },
  };
});

type ErrorHandler = { _errorHandler: boolean } & ((error: Error) => void);

/** Exported only for tests */
export function makeErrorHandler(client: NodeClient, options: OnUncaughtExceptionOptions): ErrorHandler {
  const timeout = 2000;
  let caughtFirstError: boolean = false;
  let caughtSecondError: boolean = false;
  let calledFatalError: boolean = false;
  let firstError: Error;

  const clientOptions = client.getOptions();

  return Object.assign(
    (error: Error): void => {
      let onFatalError: OnFatalErrorHandler = logAndExitProcess;

      if (options.onFatalError) {
        onFatalError = options.onFatalError;
      } else if (clientOptions.onFatalError) {
        onFatalError = clientOptions.onFatalError as OnFatalErrorHandler;
      }

      // Attaching a listener to `uncaughtException` will prevent the node process from exiting. We generally do not
      // want to alter this behaviour so we check for other listeners that users may have attached themselves and adjust
      // exit behaviour of the SDK accordingly:
      // - If other listeners are attached, do not exit.
      // - If the only listener attached is ours, exit.
      const userProvidedListenersCount = (global.process.listeners('uncaughtException') as TaggedListener[]).filter(
        listener => {
          // There are 3 listeners we ignore:
          return (
            // as soon as we're using domains this listener is attached by node itself
            listener.name !== 'domainUncaughtExceptionClear' &&
            // the handler we register for tracing
            listener.tag !== 'sentry_tracingErrorCallback' &&
            // the handler we register in this integration
            (listener as ErrorHandler)._errorHandler !== true
          );
        },
      ).length;

      const processWouldExit = userProvidedListenersCount === 0;
      const shouldApplyFatalHandlingLogic = options.exitEvenIfOtherHandlersAreRegistered || processWouldExit;

      if (!caughtFirstError) {
        // this is the first uncaught error and the ultimate reason for shutting down
        // we want to do absolutely everything possible to ensure it gets captured
        // also we want to make sure we don't go recursion crazy if more errors happen after this one
        firstError = error;
        caughtFirstError = true;

        if (getClient() === client) {
          captureException(error, {
            originalException: error,
            captureContext: {
              level: 'fatal',
            },
            mechanism: {
              handled: false,
              type: 'onuncaughtexception',
            },
          });
        }

        if (!calledFatalError && shouldApplyFatalHandlingLogic) {
          calledFatalError = true;
          onFatalError(error);
        }
      } else {
        if (shouldApplyFatalHandlingLogic) {
          if (calledFatalError) {
            // we hit an error *after* calling onFatalError - pretty boned at this point, just shut it down
            DEBUG_BUILD &&
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
    },
    { _errorHandler: true },
  );
}
