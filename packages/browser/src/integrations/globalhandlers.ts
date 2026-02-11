import type { Client, Event, IntegrationFn, Primitive, StackParser } from '@sentry/core';
import {
  addGlobalErrorInstrumentationHandler,
  addGlobalUnhandledRejectionInstrumentationHandler,
  captureEvent,
  debug,
  defineIntegration,
  getClient,
  getLocationHref,
  isPrimitive,
  isString,
  stripDataUrlContent,
  UNKNOWN_FUNCTION,
} from '@sentry/core';
import type { BrowserClient } from '../client';
import { DEBUG_BUILD } from '../debug-build';
import { eventFromUnknownInput } from '../eventbuilder';
import { shouldIgnoreOnError } from '../helpers';

type GlobalHandlersIntegrationsOptionKeys = 'onerror' | 'onunhandledrejection';

type GlobalHandlersIntegrations = Record<GlobalHandlersIntegrationsOptionKeys, boolean>;

const INTEGRATION_NAME = 'GlobalHandlers';

const _globalHandlersIntegration = ((options: Partial<GlobalHandlersIntegrations> = {}) => {
  const _options = {
    onerror: true,
    onunhandledrejection: true,
    ...options,
  };

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      Error.stackTraceLimit = 50;
    },
    setup(client) {
      if (_options.onerror) {
        _installGlobalOnErrorHandler(client);
        globalHandlerLog('onerror');
      }
      if (_options.onunhandledrejection) {
        _installGlobalOnUnhandledRejectionHandler(client);
        globalHandlerLog('onunhandledrejection');
      }
    },
  };
}) satisfies IntegrationFn;

export const globalHandlersIntegration = defineIntegration(_globalHandlersIntegration);

function _installGlobalOnErrorHandler(client: Client): void {
  addGlobalErrorInstrumentationHandler(data => {
    const { stackParser, attachStacktrace } = getOptions();

    if (getClient() !== client || shouldIgnoreOnError()) {
      return;
    }

    const { msg, url, line, column, error } = data;

    const event = _enhanceEventWithInitialFrame(
      eventFromUnknownInput(stackParser, error || msg, undefined, attachStacktrace, false),
      url,
      line,
      column,
    );

    event.level = 'error';

    captureEvent(event, {
      originalException: error,
      mechanism: {
        handled: false,
        type: 'auto.browser.global_handlers.onerror',
      },
    });
  });
}

function _installGlobalOnUnhandledRejectionHandler(client: Client): void {
  addGlobalUnhandledRejectionInstrumentationHandler(e => {
    const { stackParser, attachStacktrace } = getOptions();

    if (getClient() !== client || shouldIgnoreOnError()) {
      return;
    }

    const error = _getUnhandledRejectionError(e);

    const event = isPrimitive(error)
      ? _eventFromRejectionWithPrimitive(error)
      : eventFromUnknownInput(stackParser, error, undefined, attachStacktrace, true);

    event.level = 'error';

    captureEvent(event, {
      originalException: error,
      mechanism: {
        handled: false,
        type: 'auto.browser.global_handlers.onunhandledrejection',
      },
    });
  });
}

/**
 *
 */
export function _getUnhandledRejectionError(error: unknown): unknown {
  if (isPrimitive(error)) {
    return error;
  }

  // dig the object of the rejection out of known event types
  try {
    type ErrorWithReason = { reason: unknown };
    // PromiseRejectionEvents store the object of the rejection under 'reason'
    // see https://developer.mozilla.org/en-US/docs/Web/API/PromiseRejectionEvent
    if ('reason' in (error as ErrorWithReason)) {
      return (error as ErrorWithReason).reason;
    }

    type CustomEventWithDetail = { detail: { reason: unknown } };
    // something, somewhere, (likely a browser extension) effectively casts PromiseRejectionEvents
    // to CustomEvents, moving the `promise` and `reason` attributes of the PRE into
    // the CustomEvent's `detail` attribute, since they're not part of CustomEvent's spec
    // see https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent and
    // https://github.com/getsentry/sentry-javascript/issues/2380
    if ('detail' in (error as CustomEventWithDetail) && 'reason' in (error as CustomEventWithDetail).detail) {
      return (error as CustomEventWithDetail).detail.reason;
    }
  } catch {} // eslint-disable-line no-empty

  return error;
}

/**
 * Create an event from a promise rejection where the `reason` is a primitive.
 *
 * @param reason: The `reason` property of the promise rejection
 * @returns An Event object with an appropriate `exception` value
 */
export function _eventFromRejectionWithPrimitive(reason: Primitive): Event {
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

function _enhanceEventWithInitialFrame(
  event: Event,
  url: string | undefined,
  line: number | undefined,
  column: number | undefined,
): Event {
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

  const colno = column;
  const lineno = line;
  const filename = getFilenameFromUrl(url) ?? getLocationHref();

  // event.exception.values[0].stacktrace.frames
  if (ev0sf.length === 0) {
    ev0sf.push({
      colno,
      filename,
      function: UNKNOWN_FUNCTION,
      in_app: true,
      lineno,
    });
  }

  return event;
}

function globalHandlerLog(type: string): void {
  DEBUG_BUILD && debug.log(`Global Handler attached: ${type}`);
}

function getOptions(): { stackParser: StackParser; attachStacktrace?: boolean } {
  const client = getClient<BrowserClient>();
  const options = client?.getOptions() || {
    stackParser: () => [],
    attachStacktrace: false,
  };
  return options;
}

function getFilenameFromUrl(url: string | undefined): string | undefined {
  if (!isString(url) || url.length === 0) {
    return undefined;
  }

  // Strip data URL content to avoid long base64 strings in stack frames
  // (e.g. when initializing a Worker with a base64 encoded script)
  // Don't include data prefix for filenames as it's not useful for stack traces
  // Wrap with < > to indicate it's a placeholder
  if (url.startsWith('data:')) {
    return `<${stripDataUrlContent(url, false)}>`;
  }

  return url;
}
