import type { Client, Event, EventHint, Integration, StackFrame } from '@sentry/types';
import { getEventDescription, logger, stringMatchesSomePattern } from '@sentry/utils';

// "Script error." is hard coded into browsers for errors that it can't read.
// this is the result of a script being pulled in from an external domain and CORS.
const DEFAULT_IGNORE_ERRORS = [/^Script error\.?$/, /^Javascript error: Script error\.? on line 0$/];

const DEFAULT_IGNORE_TRANSACTIONS = [
  /^.*healthcheck.*$/,
  /^.*healthy.*$/,
  /^.*live.*$/,
  /^.*ready.*$/,
  /^.*heartbeat.*$/,
  /^.*\/health$/,
  /^.*\/healthz$/,
];

/** Options for the InboundFilters integration */
export interface InboundFiltersOptions {
  allowUrls: Array<string | RegExp>;
  denyUrls: Array<string | RegExp>;
  ignoreErrors: Array<string | RegExp>;
  ignoreTransactions: Array<string | RegExp>;
  ignoreInternal: boolean;
  disableErrorDefaults: boolean;
  disableTransactionDefaults: boolean;
}

/** Inbound filters configurable by the user */
export class InboundFilters implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'InboundFilters';

  /**
   * @inheritDoc
   */
  public name: string;

  private readonly _options: Partial<InboundFiltersOptions>;

  public constructor(options: Partial<InboundFiltersOptions> = {}) {
    this.name = InboundFilters.id;
    this._options = options;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_addGlobaleventProcessor: unknown, _getCurrentHub: unknown): void {
    // noop
  }

  /** @inheritDoc */
  public processEvent(event: Event, _eventHint: EventHint, client: Client): Event | null {
    const clientOptions = client.getOptions();
    const options = _mergeOptions(this._options, clientOptions);
    return _shouldDropEvent(event, options) ? null : event;
  }
}

/** JSDoc */
export function _mergeOptions(
  internalOptions: Partial<InboundFiltersOptions> = {},
  clientOptions: Partial<InboundFiltersOptions> = {},
): Partial<InboundFiltersOptions> {
  return {
    allowUrls: [...(internalOptions.allowUrls || []), ...(clientOptions.allowUrls || [])],
    denyUrls: [...(internalOptions.denyUrls || []), ...(clientOptions.denyUrls || [])],
    ignoreErrors: [
      ...(internalOptions.ignoreErrors || []),
      ...(clientOptions.ignoreErrors || []),
      ...(internalOptions.disableErrorDefaults ? [] : DEFAULT_IGNORE_ERRORS),
    ],
    ignoreTransactions: [
      ...(internalOptions.ignoreTransactions || []),
      ...(clientOptions.ignoreTransactions || []),
      ...(internalOptions.disableTransactionDefaults ? [] : DEFAULT_IGNORE_TRANSACTIONS),
    ],
    ignoreInternal: internalOptions.ignoreInternal !== undefined ? internalOptions.ignoreInternal : true,
  };
}

/** JSDoc */
export function _shouldDropEvent(event: Event, options: Partial<InboundFiltersOptions>): boolean {
  if (options.ignoreInternal && _isSentryError(event)) {
    __DEBUG_BUILD__ &&
      logger.warn(`Event dropped due to being internal Sentry Error.\nEvent: ${getEventDescription(event)}`);
    return true;
  }
  if (_isIgnoredError(event, options.ignoreErrors)) {
    __DEBUG_BUILD__ &&
      logger.warn(
        `Event dropped due to being matched by \`ignoreErrors\` option.\nEvent: ${getEventDescription(event)}`,
      );
    return true;
  }
  if (_isIgnoredTransaction(event, options.ignoreTransactions)) {
    __DEBUG_BUILD__ &&
      logger.warn(
        `Event dropped due to being matched by \`ignoreTransactions\` option.\nEvent: ${getEventDescription(event)}`,
      );
    return true;
  }
  if (_isDeniedUrl(event, options.denyUrls)) {
    __DEBUG_BUILD__ &&
      logger.warn(
        `Event dropped due to being matched by \`denyUrls\` option.\nEvent: ${getEventDescription(
          event,
        )}.\nUrl: ${_getEventFilterUrl(event)}`,
      );
    return true;
  }
  if (!_isAllowedUrl(event, options.allowUrls)) {
    __DEBUG_BUILD__ &&
      logger.warn(
        `Event dropped due to not being matched by \`allowUrls\` option.\nEvent: ${getEventDescription(
          event,
        )}.\nUrl: ${_getEventFilterUrl(event)}`,
      );
    return true;
  }
  return false;
}

function _isIgnoredError(event: Event, ignoreErrors?: Array<string | RegExp>): boolean {
  // If event.type, this is not an error
  if (event.type || !ignoreErrors || !ignoreErrors.length) {
    return false;
  }

  return _getPossibleEventMessages(event).some(message => stringMatchesSomePattern(message, ignoreErrors));
}

function _isIgnoredTransaction(event: Event, ignoreTransactions?: Array<string | RegExp>): boolean {
  if (event.type !== 'transaction' || !ignoreTransactions || !ignoreTransactions.length) {
    return false;
  }

  const name = event.transaction;
  return name ? stringMatchesSomePattern(name, ignoreTransactions) : false;
}

function _isDeniedUrl(event: Event, denyUrls?: Array<string | RegExp>): boolean {
  // TODO: Use Glob instead?
  if (!denyUrls || !denyUrls.length) {
    return false;
  }
  const url = _getEventFilterUrl(event);
  return !url ? false : stringMatchesSomePattern(url, denyUrls);
}

function _isAllowedUrl(event: Event, allowUrls?: Array<string | RegExp>): boolean {
  // TODO: Use Glob instead?
  if (!allowUrls || !allowUrls.length) {
    return true;
  }
  const url = _getEventFilterUrl(event);
  return !url ? true : stringMatchesSomePattern(url, allowUrls);
}

function _getPossibleEventMessages(event: Event): string[] {
  const possibleMessages: string[] = [];

  if (event.message) {
    possibleMessages.push(event.message);
  }

  let lastException;
  try {
    // @ts-expect-error Try catching to save bundle size
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    lastException = event.exception.values[event.exception.values.length - 1];
  } catch (e) {
    // try catching to save bundle size checking existence of variables
  }

  if (lastException) {
    if (lastException.value) {
      possibleMessages.push(lastException.value);
      if (lastException.type) {
        possibleMessages.push(`${lastException.type}: ${lastException.value}`);
      }
    }
  }

  if (__DEBUG_BUILD__ && possibleMessages.length === 0) {
    logger.error(`Could not extract message for event ${getEventDescription(event)}`);
  }

  return possibleMessages;
}

function _isSentryError(event: Event): boolean {
  try {
    // @ts-expect-error can't be a sentry error if undefined
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return event.exception.values[0].type === 'SentryError';
  } catch (e) {
    // ignore
  }
  return false;
}

function _getLastValidUrl(frames: StackFrame[] = []): string | null {
  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i];

    if (frame && frame.filename !== '<anonymous>' && frame.filename !== '[native code]') {
      return frame.filename || null;
    }
  }

  return null;
}

function _getEventFilterUrl(event: Event): string | null {
  try {
    let frames;
    try {
      // @ts-expect-error we only care about frames if the whole thing here is defined
      frames = event.exception.values[0].stacktrace.frames;
    } catch (e) {
      // ignore
    }
    return frames ? _getLastValidUrl(frames) : null;
  } catch (oO) {
    __DEBUG_BUILD__ && logger.error(`Cannot extract url for event ${getEventDescription(event)}`);
    return null;
  }
}
