import { logger } from '@sentry/core';
import { captureEvent } from '@sentry/minimal';
import { Integration, SentryEvent } from '@sentry/types';
import { eventFromStacktrace } from '../parsers';
import {
  installGlobalHandler,
  installGlobalUnhandledRejectionHandler,
  StackTrace as TraceKitStackTrace,
  subscribe,
} from '../tracekit';

/** Global handlers */
export class GlobalHandlers implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'GlobalHandlers';
  public constructor(
    private options: {
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
    subscribe((stack: TraceKitStackTrace) => {
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
      captureEvent(this.eventFromGlobalHandler(stack));
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

  /** TODO */
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
