/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { getCurrentHub } from '@sentry/core';
import { Event, EventHint, Hub, Integration, Primitive, StackParser } from '@sentry/types';
import {
  addExceptionMechanism,
  addInstrumentationHandler,
  getLocationHref,
  isErrorEvent,
  isPrimitive,
  isString,
  logger,
} from '@sentry/utils';

import { BrowserClient } from '../client';
import { eventFromUnknownInput } from '../eventbuilder';
import { IS_DEBUG_BUILD } from '../flags';
import { shouldIgnoreOnError } from '../helpers';

type GlobalHandlersIntegrationsOptionKeys = 'onerror' | 'onunhandledrejection';

/** JSDoc */
type GlobalHandlersIntegrations = Record<GlobalHandlersIntegrationsOptionKeys, boolean>;

/** Global handlers */
export class GlobalHandlers implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'GlobalHandlers';

  /**
   * @inheritDoc
   */
  public name: string = GlobalHandlers.id;

  /** JSDoc */
  private readonly _options: GlobalHandlersIntegrations;

  /**
   * Stores references functions to installing handlers. Will set to undefined
   * after they have been run so that they are not used twice.
   */
  private _installFunc: Record<GlobalHandlersIntegrationsOptionKeys, (() => void) | undefined> = {
    onerror: _installGlobalOnErrorHandler,
    onunhandledrejection: _installGlobalOnUnhandledRejectionHandler,
  };

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
    const options = this._options;

    // We can disable guard-for-in as we construct the options object above + do checks against
    // `this._installFunc` for the property.
    // eslint-disable-next-line guard-for-in
    for (const key in options) {
      const installFunc = this._installFunc[key as GlobalHandlersIntegrationsOptionKeys];
      if (installFunc && options[key as GlobalHandlersIntegrationsOptionKeys]) {
        globalHandlerLog(key);
        installFunc();
        this._installFunc[key as GlobalHandlersIntegrationsOptionKeys] = undefined;
      }
    }
  }
}

/** JSDoc */
function _installGlobalOnErrorHandler(): void {
  addInstrumentationHandler(
    'error',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data: { msg: any; url: any; line: any; column: any; error: any }) => {
      const [hub, stackParser, attachStacktrace] = getHubAndOptions();
      if (!hub.getIntegration(GlobalHandlers)) {
        return;
      }
      const { msg, url, line, column, error } = data;
      if (shouldIgnoreOnError() || (error && error.__sentry_own_request__)) {
        return;
      }

      const event =
        error === undefined && isString(msg)
          ? _eventFromIncompleteOnError(msg, url, line, column)
          : _enhanceEventWithInitialFrame(
              eventFromUnknownInput(stackParser, error || msg, undefined, attachStacktrace, false),
              url,
              line,
              column,
            );

      event.level = 'error';

      addMechanismAndCapture(hub, error, event, 'onerror');
    },
  );
}

/** JSDoc */
function _installGlobalOnUnhandledRejectionHandler(): void {
  addInstrumentationHandler(
    'unhandledrejection',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      const [hub, stackParser, attachStacktrace] = getHubAndOptions();
      if (!hub.getIntegration(GlobalHandlers)) {
        return;
      }
      let error = e;

      // dig the object of the rejection out of known event types
      try {
        // PromiseRejectionEvents store the object of the rejection under 'reason'
        // see https://developer.mozilla.org/en-US/docs/Web/API/PromiseRejectionEvent
        if ('reason' in e) {
          error = e.reason;
        }
        // something, somewhere, (likely a browser extension) effectively casts PromiseRejectionEvents
        // to CustomEvents, moving the `promise` and `reason` attributes of the PRE into
        // the CustomEvent's `detail` attribute, since they're not part of CustomEvent's spec
        // see https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent and
        // https://github.com/getsentry/sentry-javascript/issues/2380
        else if ('detail' in e && 'reason' in e.detail) {
          error = e.detail.reason;
        }
      } catch (_oO) {
        // no-empty
      }

      if (shouldIgnoreOnError() || (error && error.__sentry_own_request__)) {
        return true;
      }

      const event = isPrimitive(error)
        ? _eventFromRejectionWithPrimitive(error)
        : eventFromUnknownInput(stackParser, error, undefined, attachStacktrace, true);

      event.level = 'error';

      addMechanismAndCapture(hub, error, event, 'onunhandledrejection');
      return;
    },
  );
}

/**
 * Create an event from a promise rejection where the `reason` is a primitive.
 *
 * @param reason: The `reason` property of the promise rejection
 * @returns An Event object with an appropriate `exception` value
 */
function _eventFromRejectionWithPrimitive(reason: Primitive): Event {
  return {
    exception: {
      values: [
        {
          type: 'UnhandledRejection',
          // String() is needed because the Primitive type includes symbols (which can't be automatically stringified)
          value: `Non-Error promise rejection captured with value: ${String(reason)}`,
        },
      ],
    },
  };
}

/**
 * This function creates a stack from an old, error-less onerror handler.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _eventFromIncompleteOnError(msg: any, url: any, line: any, column: any): Event {
  const ERROR_TYPES_RE =
    /^(?:[Uu]ncaught (?:exception: )?)?(?:((?:Eval|Internal|Range|Reference|Syntax|Type|URI|)Error): )?(.*)$/i;

  // If 'message' is ErrorEvent, get real message from inside
  let message = isErrorEvent(msg) ? msg.message : msg;
  let name = 'Error';

  const groups = message.match(ERROR_TYPES_RE);
  if (groups) {
    name = groups[1];
    message = groups[2];
  }

  const event = {
    exception: {
      values: [
        {
          type: name,
          value: message,
        },
      ],
    },
  };

  return _enhanceEventWithInitialFrame(event, url, line, column);
}

/** JSDoc */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _enhanceEventWithInitialFrame(event: Event, url: any, line: any, column: any): Event {
  // event.exception
  const e = (event.exception = event.exception || {});
  // event.exception.values
  const ev = (e.values = e.values || []);
  // event.exception.values[0]
  const ev0 = (ev[0] = ev[0] || {});
  // event.exception.values[0].stacktrace
  const ev0s = (ev0.stacktrace = ev0.stacktrace || {});
  // event.exception.values[0].stacktrace.frames
  const ev0sf = (ev0s.frames = ev0s.frames || []);

  const colno = isNaN(parseInt(column, 10)) ? undefined : column;
  const lineno = isNaN(parseInt(line, 10)) ? undefined : line;
  const filename = isString(url) && url.length > 0 ? url : getLocationHref();

  // event.exception.values[0].stacktrace.frames
  if (ev0sf.length === 0) {
    ev0sf.push({
      colno,
      filename,
      function: '?',
      in_app: true,
      lineno,
    });
  }

  return event;
}

function globalHandlerLog(type: string): void {
  IS_DEBUG_BUILD && logger.log(`Global Handler attached: ${type}`);
}

function addMechanismAndCapture(hub: Hub, error: EventHint['originalException'], event: Event, type: string): void {
  addExceptionMechanism(event, {
    handled: false,
    type,
  });
  hub.captureEvent(event, {
    originalException: error,
  });
}

function getHubAndOptions(): [Hub, StackParser, boolean | undefined] {
  const hub = getCurrentHub();
  const client = hub.getClient<BrowserClient>();
  const options = (client && client.getOptions()) || {
    stackParser: () => [],
    attachStacktrace: false,
  };
  return [hub, options.stackParser, options.attachStacktrace];
}
