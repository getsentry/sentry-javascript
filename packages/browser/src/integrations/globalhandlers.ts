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
  /**
   * @inheritDoc
   */
  public install(
    options: {
      onerror: boolean;
      onunhandledpromiserejection: boolean;
    } = {
      onerror: true,
      onunhandledpromiserejection: true,
    },
  ): void {
    if (options.onerror) {
      installGlobalHandler();
    }

    if (options.onunhandledpromiserejection) {
      installGlobalUnhandledRejectionHandler();
    }

    subscribe((stack: TraceKitStackTrace) =>
      captureEvent(this.eventFromGlobalHandler(stack)),
    );
  }

  /** TODO */
  private eventFromGlobalHandler(stacktrace: TraceKitStackTrace): SentryEvent {
    const event = eventFromStacktrace(stacktrace);
    // TODO: Make a distinction between 'onunhandledrejection' and 'onerror'
    return {
      ...event,
      exception: {
        ...event.exception,
        mechanism: {
          handled: false,
          type: 'onerror',
        },
      },
    };
  }
}
