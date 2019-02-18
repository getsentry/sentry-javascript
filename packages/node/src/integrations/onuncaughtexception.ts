import { getCurrentHub, Scope } from '@sentry/core';
import { Integration, Severity } from '@sentry/types';
import { logger } from '@sentry/utils/logger';
import { defaultOnFatalError } from '../handlers';

/** Global Promise Rejection handler */
export class OnUncaughtException implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = OnUncaughtException.id;
  /**
   * @inheritDoc
   */
  public static id: string = 'OnUncaughtException';

  /**
   * @inheritDoc
   */
  public readonly handler: (error: Error) => void = makeErrorHandler(
    // tslint:disable-next-line
    this.options.onFatalError,
  );
  /**
   * @inheritDoc
   */
  public constructor(
    private readonly options: {
      /**
       * Default onFatalError handler
       * @param firstError Error that has been thrown
       * @param secondError If this was called multiple times this will be set
       */
      onFatalError?(firstError: Error, secondError?: Error): void;
    } = {},
  ) {}
  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    global.process.on('uncaughtException', this.handler.bind(this));
  }
}

/**
 * @hidden
 */
export function makeErrorHandler(
  onFatalError: (firstError: Error, secondError?: Error) => void = defaultOnFatalError,
): (error: Error) => void {
  const timeout = 2000;
  let caughtFirstError: boolean = false;
  let caughtSecondError: boolean = false;
  let calledFatalError: boolean = false;
  let firstError: Error;

  return (error: Error): void => {
    if (!caughtFirstError) {
      const hub = getCurrentHub();

      // this is the first uncaught error and the ultimate reason for shutting down
      // we want to do absolutely everything possible to ensure it gets captured
      // also we want to make sure we don't go recursion crazy if more errors happen after this one
      firstError = error;
      caughtFirstError = true;

      if (hub.getIntegration(OnUncaughtException)) {
        hub.withScope((scope: Scope) => {
          scope.setLevel(Severity.Fatal);
          hub.captureException(error, { originalException: error });
          if (!calledFatalError) {
            calledFatalError = true;
            onFatalError(error);
          }
        });
      } else {
        if (!calledFatalError) {
          calledFatalError = true;
          onFatalError(error);
        }
      }
    } else if (calledFatalError) {
      // we hit an error *after* calling onFatalError - pretty boned at this point, just shut it down
      logger.warn('uncaught exception after calling fatal error shutdown callback - this is bad! forcing shutdown');
      defaultOnFatalError(error);
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
  };
}
