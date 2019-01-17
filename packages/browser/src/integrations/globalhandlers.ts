import { getCurrentHub } from '@sentry/core';
import { Integration, SentryEvent } from '@sentry/types';
import { logger } from '@sentry/utils/logger';
import { safeNormalize, serialize } from '@sentry/utils/object';
import { truncate } from '@sentry/utils/string';
import { addExceptionTypeValue, eventFromStacktrace } from '../parsers';
import {
  installGlobalHandler,
  installGlobalUnhandledRejectionHandler,
  StackTrace as TraceKitStackTrace,
  subscribe,
} from '../tracekit';
import { shouldIgnoreOnError } from './helpers';

/** JSDoc */
interface GlobalHandlersIntegrations {
  onerror: boolean;
  onunhandledrejection: boolean;
}

/** Global handlers */
export class GlobalHandlers implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = GlobalHandlers.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'GlobalHandlers';

  /** JSDoc */
  private readonly options: GlobalHandlersIntegrations;

  /** JSDoc */
  public constructor(options?: GlobalHandlersIntegrations) {
    this.options = {
      onerror: true,
      onunhandledrejection: true,
      ...options,
    };
  }
  /**
   * @inheritDoc
   */
  public setupOnce(): void {
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
      const self = getCurrentHub().getIntegration(GlobalHandlers);
      if (self) {
        getCurrentHub().captureEvent(self.eventFromGlobalHandler(stack), { originalException: error, data: { stack } });
      }
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

  /**
   * This function creates an SentryEvent from an TraceKitStackTrace.
   *
   * @param stacktrace TraceKitStackTrace to be converted to an SentryEvent.
   */
  private eventFromGlobalHandler(stacktrace: TraceKitStackTrace): SentryEvent {
    const event = eventFromStacktrace(stacktrace);

    const data: { [key: string]: string } = {
      mode: stacktrace.mode,
    };

    if (stacktrace.message) {
      data.message = stacktrace.message;
    }

    if (stacktrace.name) {
      data.name = stacktrace.name;
    }

    const newEvent: SentryEvent = {
      ...event,
      exception: {
        ...event.exception,
        mechanism: {
          data,
          handled: false,
          type: stacktrace.mechanism,
        },
      },
    };

    const fallbackValue =
      typeof stacktrace.original !== 'undefined'
        ? `${truncate(serialize(safeNormalize(stacktrace.original)), 300)}`
        : '';
    const fallbackType = stacktrace.mechanism === 'onunhandledrejection' ? 'UnhandledRejection' : 'Error';

    // This makes sure we have type/value in every exception
    addExceptionTypeValue(newEvent, fallbackValue, fallbackType);

    return newEvent;
  }
}
