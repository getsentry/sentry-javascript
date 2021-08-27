import { getCurrentHub, Hub } from '@sentry/hub';
import { Options, TraceparentData, Transaction } from '@sentry/types';
import { dropUndefinedKeys, SentryError, unicodeToBase64 } from '@sentry/utils';

export const SENTRY_TRACE_REGEX = new RegExp(
  '^[ \\t]*' + // whitespace
  '([0-9a-f]{32})?' + // trace_id
  '-?([0-9a-f]{16})?' + // span_id
  '-?([01])?' + // sampled
    '[ \\t]*$', // whitespace
);

// This is a normal base64 regex, modified to reflect that fact that we strip the trailing = or == off
const BASE64_STRIPPED_REGEX = new RegExp(
  // for our purposes, we want to test against the entire string, so enforce that there's nothing before the main regex
  `^` +
    // any of the characters in the base64 "alphabet", in multiples of 4
    '([a-zA-Z0-9+/]{4})*' +
    // either nothing or 2 or 3 base64-alphabet characters (see
    // https://en.wikipedia.org/wiki/Base64#Decoding_Base64_without_padding
    // for why there's never only 1 extra character)
    '([a-zA-Z0-9+/]{2,3})?' +
    // see above re: matching entire string
    `$`,
);

// comma-delimited list of entries of the form `xxx=yyy`
const tracestateEntry = '[^=]+=[^=]+';
const TRACESTATE_ENTRIES_REGEX = new RegExp(
  // one or more xxxxx=yyyy entries
  `^(${tracestateEntry})+` +
    // each entry except the last must be followed by a comma
    '(,|$)',
);

// this doesn't check that the value is valid, just that there's something there of the form `sentry=xxxx`
const SENTRY_TRACESTATE_ENTRY_REGEX = new RegExp(
  // either sentry is the first entry or there's stuff immediately before it, ending in a commma (this prevents matching
  // something like `coolsentry=xxx`)
  '(?:^|.+,)' +
    // sentry's part, not including the potential comma
    '(sentry=[^,]*)' +
    // either there's a comma and another vendor's entry or we end
    '(?:,.+|$)',
);

/**
 * Determines if tracing is currently enabled.
 *
 * Tracing is enabled when at least one of `tracesSampleRate` and `tracesSampler` is defined in the SDK config.
 */
export function hasTracingEnabled(
  options: Options | undefined = getCurrentHub()
    .getClient()
    ?.getOptions(),
): boolean {
  if (!options) {
    return false;
  }
  return 'tracesSampleRate' in options || 'tracesSampler' in options;
}

/**
 * Extract transaction context data from a `sentry-trace` header.
 *
 * @param header Traceparent string
 *
 * @returns Object containing data from the header, or undefined if traceparent string is malformed
 */
export function extractSentrytraceData(header: string): TraceparentData | undefined {
  const matches = header.match(SENTRY_TRACE_REGEX);

  if (matches) {
    let parentSampled: boolean | undefined;
    if (matches[3] === '1') {
      parentSampled = true;
    } else if (matches[3] === '0') {
      parentSampled = false;
    }
    return {
      traceId: matches[1],
      parentSampled,
      parentSpanId: matches[2],
    };
  }

  return undefined;
}

/**
 * Extract data from an incoming `tracestate` header
 *
 * @param header
 * @returns Object containing data from the header
 */
export function extractTracestateData(header: string): { sentry?: string; thirdparty?: string } {
  let sentryEntry, thirdPartyEntry, before, after;

  // find sentry's entry, if any
  const sentryMatch = SENTRY_TRACESTATE_ENTRY_REGEX.exec(header);

  if (sentryMatch !== null) {
    sentryEntry = sentryMatch[1];

    // remove the commas after the split so we don't end up with `xxx=yyy,,zzz=qqq` (double commas) when we put them
    // back together
    [before, after] = header.split(sentryEntry).map(s => s.replace(/^,*|,*$/g, ''));

    // extract sentry's value from its entry and test to make sure it's valid; if it isn't, discard the entire entry
    // so that a new one will be created by the Transaction constructor
    const sentryValue = sentryEntry.replace('sentry=', '');
    if (!BASE64_STRIPPED_REGEX.test(sentryValue)) {
      sentryEntry = undefined;
    }
  } else {
    // this could just as well be `before`; we just need to get the thirdparty data into one or the other since
    // there's no valid Sentry entry
    after = header;
  }

  // if either thirdparty part is invalid or empty, remove it before gluing them together
  const validThirdpartyEntries = [before, after].filter(x => TRACESTATE_ENTRIES_REGEX.test(x || ''));
  if (validThirdpartyEntries.length) {
    thirdPartyEntry = validThirdpartyEntries.join(',');
  }

  return { sentry: sentryEntry, thirdparty: thirdPartyEntry };
}

/** Grabs active transaction off scope, if any */
export function getActiveTransaction<T extends Transaction>(hub: Hub = getCurrentHub()): T | undefined {
  return hub?.getScope()?.getTransaction() as T | undefined;
}

/**
 * Converts from milliseconds to seconds
 * @param time time in ms
 */
export function msToSec(time: number): number {
  return time / 1000;
}

/**
 * Converts from seconds to milliseconds
 * @param time time in seconds
 */
export function secToMs(time: number): number {
  return time * 1000;
}

// so it can be used in manual instrumentation without necessitating a hard dependency on @sentry/utils
export { stripUrlQueryAndFragment } from '@sentry/utils';

type SentryTracestateData = {
  trace_id: string;
  environment?: string;
  release?: string;
  public_key: string;
  user?: { id?: string; segment?: string };
  transaction?: string;
};

/**
 * Compute the value of a Sentry tracestate header.
 *
 * @throws SentryError (because using the logger creates a circular dependency)
 * @returns the base64-encoded header value
 */
export function computeTracestateValue(data: SentryTracestateData): string {
  // `JSON.stringify` will drop keys with undefined values, but not ones with null values, so this prevents
  // these values from being dropped if they haven't been set by `Sentry.init`

  // See https://www.w3.org/TR/trace-context/#tracestate-header-field-values
  // The spec for tracestate header values calls for a string of the form
  //
  //    identifier1=value1,identifier2=value2,...
  //
  // which means the value can't include any equals signs, since they already have meaning. Equals signs are commonly
  // used to pad the end of base64 values though, so to avoid confusion, we strip them off. (Most languages' base64
  // decoding functions (including those in JS) are able to function without the padding.)
  try {
    return unicodeToBase64(JSON.stringify(dropUndefinedKeys(data))).replace(/={1,2}$/, '');
  } catch (err) {
    throw new SentryError(`[Tracing] Error computing tracestate value from data: ${err}\nData: ${data}`);
  }
}
