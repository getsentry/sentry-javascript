import { getCurrentHub, logger } from '@sentry/core';
import { Integration, SentryEvent } from '@sentry/types';
import { eventFromStacktrace } from '../parsers';
import {
  installGlobalHandler,
  installGlobalUnhandledRejectionHandler,
  StackTrace as TraceKitStackTrace,
  subscribe,
} from '../tracekit';
import { shouldIgnoreOnError } from './helpers';

/** Global handlers */
export class GlobalHandlers implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'GlobalHandlers';
  public constructor(
    private readonly options: {
      onerror: boolean;
      onunhandledrejection: boolean;
    } = {
      onerror: true,
      onunhandledrejection: true,
    },
  ) {}
  /**
   * @inheritDoc
   */
  public install(): void {
    subscribe((stack: TraceKitStackTrace, _: boolean, error: Error) => {
      // TODO: use stack.context to get a valuable information from TraceKit, eg.
      // [
      //   0: "  })"
      //   1: ""
      //   2: "  function foo () {"
      //   3: "    Sentry.captureException('some error')"
      //   4: "    Sentry.captureMessage('some message')"
      //   5: "    throw 'foo'"
      //   6: "  }"
      //   7: ""
      //   8: "  function bar () {"
      //   9: "    foo();"
      //   10: "  }"
      // ]
      if (shouldIgnoreOnError()) {
        return;
      }
      getCurrentHub().captureEvent(this.eventFromGlobalHandler(stack), { originalException: error, data: { stack } });
    });

    if (this.options.onerror) {
      logger.log('Global Handler attached: onerror');
      installGlobalHandler();
    }

    if (this.options.onunhandledrejection) {
      logger.log('Global Handler attached: onunhandledrejection');
      installGlobalUnhandledRejectionHandler();
    }
  }

  /** JSDoc */
  private eventFromGlobalHandler(stacktrace: TraceKitStackTrace): SentryEvent {
    const event = eventFromStacktrace(stacktrace);
    return {
      ...event,
      exception: {
        ...event.exception,
        mechanism: {
          handled: false,
          type: stacktrace.mode === 'onerror' ? 'onerror' : 'onunhandledrejection',
        },
      },
    };
  }
}
