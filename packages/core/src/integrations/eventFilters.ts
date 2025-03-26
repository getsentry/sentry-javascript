import type { Event, IntegrationFn, StackFrame } from '../types-hoist';

import { DEBUG_BUILD } from '../debug-build';
import { defineIntegration } from '../integration';
import { logger } from '../utils-hoist/logger';
import { getEventDescription } from '../utils-hoist/misc';
import { stringMatchesSomePattern } from '../utils-hoist/string';
import { getPossibleEventMessages } from '../utils/eventUtils';

// "Script error." is hard coded into browsers for errors that it can't read.
// this is the result of a script being pulled in from an external domain and CORS.
const DEFAULT_IGNORE_ERRORS = [
  /^Script error\.?$/,
  /^Javascript error: Script error\.? on line 0$/,
  /^ResizeObserver loop completed with undelivered notifications.$/, // The browser logs this when a ResizeObserver handler takes a bit longer. Usually this is not an actual issue though. It indicates slowness.
  /^Cannot redefine property: googletag$/, // This is thrown when google tag manager is used in combination with an ad blocker
  /^Can't find variable: gmo$/, // Error from Google Search App https://issuetracker.google.com/issues/396043331
  /^undefined is not an object \(evaluating 'a\.[A-Z]'\)$/, // Random error that happens but not actionable or noticeable to end-users.
  'can\'t redefine non-configurable property "solana"', // Probably a browser extension or custom browser (Brave) throwing this error
  "vv().getRestrictions is not a function. (In 'vv().getRestrictions(1,a)', 'vv().getRestrictions' is undefined)", // Error thrown by GTM, seemingly not affecting end-users
  "Can't find variable: _AutofillCallbackHandler", // Unactionable error in instagram webview https://developers.facebook.com/community/threads/320013549791141/
  /^Non-Error promise rejection captured with value: Object Not Found Matching Id:\d+, MethodName:simulateEvent, ParamCount:\d+$/, // unactionable error from CEFSharp, a .NET library that embeds chromium in .NET apps
  /^Java exception was raised during method invocation$/, // error from Facebook Mobile browser (https://github.com/getsentry/sentry-javascript/issues/15065)
];

/** Options for the EventFilters integration */
export interface EventFiltersOptions {
  allowUrls: Array<string | RegExp>;
  denyUrls: Array<string | RegExp>;
  ignoreErrors: Array<string | RegExp>;
  ignoreTransactions: Array<string | RegExp>;
  ignoreInternal: boolean;
  disableErrorDefaults: boolean;
}

const INTEGRATION_NAME = 'EventFilters';

/**
 * An integration that filters out events (errors and transactions) based on:
 *
 * - (Errors) A curated list of known low-value or irrelevant errors (see {@link DEFAULT_IGNORE_ERRORS})
 * - (Errors) A list of error messages or urls/filenames passed in via
 *   - Top level Sentry.init options (`ignoreErrors`, `denyUrls`, `allowUrls`)
 *   - The same options passed to the integration directly via @param options
 * - (Transactions/Spans) A list of root span (transaction) names passed in via
 *   - Top level Sentry.init option (`ignoreTransactions`)
 *   - The same option passed to the integration directly via @param options
 *
 * Events filtered by this integration will not be sent to Sentry.
 */
export const eventFiltersIntegration = defineIntegration((options: Partial<EventFiltersOptions> = {}) => {
  let mergedOptions: Partial<EventFiltersOptions> | undefined;
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      const clientOptions = client.getOptions();
      mergedOptions = _mergeOptions(options, clientOptions);
    },
    processEvent(event, _hint, client) {
      if (!mergedOptions) {
        const clientOptions = client.getOptions();
        mergedOptions = _mergeOptions(options, clientOptions);
      }
      return _shouldDropEvent(event, mergedOptions) ? null : event;
    },
  };
});

/**
 * An integration that filters out events (errors and transactions) based on:
 *
 * - (Errors) A curated list of known low-value or irrelevant errors (see {@link DEFAULT_IGNORE_ERRORS})
 * - (Errors) A list of error messages or urls/filenames passed in via
 *   - Top level Sentry.init options (`ignoreErrors`, `denyUrls`, `allowUrls`)
 *   - The same options passed to the integration directly via @param options
 * - (Transactions/Spans) A list of root span (transaction) names passed in via
 *   - Top level Sentry.init option (`ignoreTransactions`)
 *   - The same option passed to the integration directly via @param options
 *
 * Events filtered by this integration will not be sent to Sentry.
 *
 * @deprecated this integration was renamed and will be removed in a future major version.
 * Use `eventFiltersIntegration` instead.
 */
export const inboundFiltersIntegration = defineIntegration(((options: Partial<EventFiltersOptions> = {}) => {
  return {
    ...eventFiltersIntegration(options),
    name: 'InboundFilters',
  };
}) satisfies IntegrationFn);

function _mergeOptions(
  internalOptions: Partial<EventFiltersOptions> = {},
  clientOptions: Partial<EventFiltersOptions> = {},
): Partial<EventFiltersOptions> {
  return {
    allowUrls: [...(internalOptions.allowUrls || []), ...(clientOptions.allowUrls || [])],
    denyUrls: [...(internalOptions.denyUrls || []), ...(clientOptions.denyUrls || [])],
    ignoreErrors: [
      ...(internalOptions.ignoreErrors || []),
      ...(clientOptions.ignoreErrors || []),
      ...(internalOptions.disableErrorDefaults ? [] : DEFAULT_IGNORE_ERRORS),
    ],
    ignoreTransactions: [...(internalOptions.ignoreTransactions || []), ...(clientOptions.ignoreTransactions || [])],
  };
}

function _shouldDropEvent(event: Event, options: Partial<EventFiltersOptions>): boolean {
  if (!event.type) {
    // Filter errors
    if (_isIgnoredError(event, options.ignoreErrors)) {
      DEBUG_BUILD &&
        logger.warn(
          `Event dropped due to being matched by \`ignoreErrors\` option.\nEvent: ${getEventDescription(event)}`,
        );
      return true;
    }
    if (_isUselessError(event)) {
      DEBUG_BUILD &&
        logger.warn(
          `Event dropped due to not having an error message, error type or stacktrace.\nEvent: ${getEventDescription(
            event,
          )}`,
        );
      return true;
    }
    if (_isDeniedUrl(event, options.denyUrls)) {
      DEBUG_BUILD &&
        logger.warn(
          `Event dropped due to being matched by \`denyUrls\` option.\nEvent: ${getEventDescription(
            event,
          )}.\nUrl: ${_getEventFilterUrl(event)}`,
        );
      return true;
    }
    if (!_isAllowedUrl(event, options.allowUrls)) {
      DEBUG_BUILD &&
        logger.warn(
          `Event dropped due to not being matched by \`allowUrls\` option.\nEvent: ${getEventDescription(
            event,
          )}.\nUrl: ${_getEventFilterUrl(event)}`,
        );
      return true;
    }
  } else if (event.type === 'transaction') {
    // Filter transactions

    if (_isIgnoredTransaction(event, options.ignoreTransactions)) {
      DEBUG_BUILD &&
        logger.warn(
          `Event dropped due to being matched by \`ignoreTransactions\` option.\nEvent: ${getEventDescription(event)}`,
        );
      return true;
    }
  }
  return false;
}

function _isIgnoredError(event: Event, ignoreErrors?: Array<string | RegExp>): boolean {
  if (!ignoreErrors?.length) {
    return false;
  }

  return getPossibleEventMessages(event).some(message => stringMatchesSomePattern(message, ignoreErrors));
}

function _isIgnoredTransaction(event: Event, ignoreTransactions?: Array<string | RegExp>): boolean {
  if (!ignoreTransactions?.length) {
    return false;
  }

  const name = event.transaction;
  return name ? stringMatchesSomePattern(name, ignoreTransactions) : false;
}

function _isDeniedUrl(event: Event, denyUrls?: Array<string | RegExp>): boolean {
  if (!denyUrls?.length) {
    return false;
  }
  const url = _getEventFilterUrl(event);
  return !url ? false : stringMatchesSomePattern(url, denyUrls);
}

function _isAllowedUrl(event: Event, allowUrls?: Array<string | RegExp>): boolean {
  if (!allowUrls?.length) {
    return true;
  }
  const url = _getEventFilterUrl(event);
  return !url ? true : stringMatchesSomePattern(url, allowUrls);
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
    // If there are linked exceptions or exception aggregates we only want to match against the top frame of the "root" (the main exception)
    // The root always comes last in linked exceptions
    const rootException = [...(event.exception?.values ?? [])]
      .reverse()
      .find(value => value.mechanism?.parent_id === undefined && value.stacktrace?.frames?.length);
    const frames = rootException?.stacktrace?.frames;
    return frames ? _getLastValidUrl(frames) : null;
  } catch (oO) {
    DEBUG_BUILD && logger.error(`Cannot extract url for event ${getEventDescription(event)}`);
    return null;
  }
}

function _isUselessError(event: Event): boolean {
  // We only want to consider events for dropping that actually have recorded exception values.
  if (!event.exception?.values?.length) {
    return false;
  }

  return (
    // No top-level message
    !event.message &&
    // There are no exception values that have a stacktrace, a non-generic-Error type or value
    !event.exception.values.some(value => value.stacktrace || (value.type && value.type !== 'Error') || value.value)
  );
}
