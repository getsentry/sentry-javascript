import { getCurrentHub } from '@sentry/core';
import { Event, Integration, Severity } from '@sentry/types';
import {
  addExceptionTypeValue,
  isPrimitive,
  isString,
  keysToEventMessage,
  logger,
  normalize,
  normalizeToSize,
  truncate,
} from '@sentry/utils';

import { shouldIgnoreOnError } from '../helpers';
import { eventFromStacktrace } from '../parsers';
import {
  _installGlobalHandler,
  _installGlobalUnhandledRejectionHandler,
  _subscribe,
  StackTrace as TraceKitStackTrace,
} from '../tracekit';

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
  private readonly _options: GlobalHandlersIntegrations;

  /** JSDoc */
  public constructor(options?: GlobalHandlersIntegrations) {
    this._options = {
      onerror: true,
      onunhandledrejection: true,
      ...options,
    };
  }
  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    Error.stackTraceLimit = 50;

    _subscribe((stack: TraceKitStackTrace, _: boolean, error: any) => {
      if (shouldIgnoreOnError()) {
        return;
      }
      const self = getCurrentHub().getIntegration(GlobalHandlers);
      if (self) {
        getCurrentHub().captureEvent(self._eventFromGlobalHandler(stack, error), {
          data: { stack },
          originalException: error,
        });
      }
    });

    if (this._options.onerror) {
      logger.log('Global Handler attached: onerror');
      _installGlobalHandler();
    }

    if (this._options.onunhandledrejection) {
      logger.log('Global Handler attached: onunhandledrejection');
      _installGlobalUnhandledRejectionHandler();
    }
  }

  /**
   * This function creates an Event from an TraceKitStackTrace.
   *
   * @param stacktrace TraceKitStackTrace to be converted to an Event.
   */
  private _eventFromGlobalHandler(stacktrace: TraceKitStackTrace, error: any): Event {
    if (!isString(stacktrace.message) && stacktrace.mechanism !== 'onunhandledrejection') {
      // There are cases where stacktrace.message is an Event object
      // https://github.com/getsentry/sentry-javascript/issues/1949
      // In this specific case we try to extract stacktrace.message.error.message
      const message = (stacktrace.message as unknown) as any;
      stacktrace.message =
        message.error && isString(message.error.message) ? message.error.message : 'No error message';
    }

    if (stacktrace.mechanism === 'onunhandledrejection' && (stacktrace.incomplete || stacktrace.mode === 'failed')) {
      return this._eventFromIncompleteRejection(stacktrace, error);
    }

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

    const client = getCurrentHub().getClient();
    const maxValueLength = (client && client.getOptions().maxValueLength) || 250;

    const fallbackValue = stacktrace.original
      ? truncate(JSON.stringify(normalize(stacktrace.original)), maxValueLength)
      : '';
    const fallbackType = stacktrace.mechanism === 'onunhandledrejection' ? 'UnhandledRejection' : 'Error';

    // This makes sure we have type/value in every exception
    addExceptionTypeValue(event, fallbackValue, fallbackType, {
      data,
      handled: false,
      type: stacktrace.mechanism,
    });

    return event;
  }

  /**
   * This function creates an Event from an TraceKitStackTrace that has part of it missing.
   *
   * @param stacktrace TraceKitStackTrace to be converted to an Event.
   */
  private _eventFromIncompleteRejection(stacktrace: TraceKitStackTrace, error: any): Event {
    const event: Event = {
      level: Severity.Error,
    };

    if (isPrimitive(error)) {
      event.exception = {
        values: [
          {
            type: 'UnhandledRejection',
            value: `Non-Error promise rejection captured with value: ${error}`,
          },
        ],
      };
    } else {
      event.exception = {
        values: [
          {
            type: 'UnhandledRejection',
            value: `Non-Error promise rejection captured with keys: ${keysToEventMessage(Object.keys(error).sort())}`,
          },
        ],
      };
      event.extra = {
        __serialized__: normalizeToSize(error),
      };
    }

    if (event.exception.values && event.exception.values[0]) {
      event.exception.values[0].mechanism = {
        data: {
          mode: stacktrace.mode,
          ...(stacktrace.incomplete && { incomplete: stacktrace.incomplete }),
          ...(stacktrace.message && { message: stacktrace.message }),
          ...(stacktrace.name && { name: stacktrace.name }),
        },
        handled: false,
        type: stacktrace.mechanism,
      };
    }

    return event;
  }
}
