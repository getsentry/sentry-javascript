import { getGlobalObject } from './crossplatform';
import { SentryError } from './error';
import { isRegExp, isString } from './is';

/**
 * Truncates given string to the maximum characters count
 *
 * @param str An object that contains serializable values
 * @param max Maximum number of characters in truncated string (0 = unlimited)
 * @returns string Encoded
 */
export function truncate(str: string, max: number = 0): string {
  if (typeof str !== 'string' || max === 0) {
    return str;
  }
  return str.length <= max ? str : `${str.substr(0, max)}...`;
}

/**
 * This is basically just `trim_line` from
 * https://github.com/getsentry/sentry/blob/master/src/sentry/lang/javascript/processor.py#L67
 *
 * @param str An object that contains serializable values
 * @param max Maximum number of characters in truncated string
 * @returns string Encoded
 */
export function snipLine(line: string, colno: number): string {
  let newLine = line;
  const ll = newLine.length;
  if (ll <= 150) {
    return newLine;
  }
  if (colno > ll) {
    // eslint-disable-next-line no-param-reassign
    colno = ll;
  }

  let start = Math.max(colno - 60, 0);
  if (start < 5) {
    start = 0;
  }

  let end = Math.min(start + 140, ll);
  if (end > ll - 5) {
    end = ll;
  }
  if (end === ll) {
    start = Math.max(end - 140, 0);
  }

  newLine = newLine.slice(start, end);
  if (start > 0) {
    newLine = `'{snip} ${newLine}`;
  }
  if (end < ll) {
    newLine += ' {snip}';
  }

  return newLine;
}

/**
 * Join values in array
 * @param input array of values to be joined together
 * @param delimiter string to be placed in-between values
 * @returns Joined values
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeJoin(input: any[], delimiter?: string): string {
  if (!Array.isArray(input)) {
    return '';
  }

  const output = [];
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let i = 0; i < input.length; i++) {
    const value = input[i];
    try {
      output.push(String(value));
    } catch (e) {
      output.push('[value cannot be serialized]');
    }
  }

  return output.join(delimiter);
}

/**
 * Checks if the value matches a regex or includes the string
 * @param value The string value to be checked against
 * @param pattern Either a regex or a string that must be contained in value
 */
export function isMatchingPattern(value: string, pattern: RegExp | string): boolean {
  if (!isString(value)) {
    return false;
  }

  if (isRegExp(pattern)) {
    return (pattern as RegExp).test(value);
  }
  if (typeof pattern === 'string') {
    return value.indexOf(pattern) !== -1;
  }
  return false;
}

type GlobalWithBase64Helpers = {
  // browser
  atob?: (base64String: string) => string;
  btoa?: (utf8String: string) => string;
  // Node
  Buffer?: { from: (input: string, encoding: string) => { toString: (encoding: string) => string } };
};

/**
 * Convert a Unicode string to a base64 string.
 *
 * @param plaintext The string to base64-encode
 * @throws SentryError (because using the logger creates a circular dependency)
 * @returns A base64-encoded version of the string
 */
export function unicodeToBase64(plaintext: string): string {
  const globalObject = getGlobalObject<GlobalWithBase64Helpers>();

  // To account for the fact that different platforms use different character encodings natively, our `tracestate`
  // spec calls for all jsonified data to be encoded in UTF-8 bytes before being passed to the base64 encoder.
  try {
    if (typeof plaintext !== 'string') {
      throw new Error(`Input must be a string. Received input of type '${typeof plaintext}'.`);
    }

    // browser
    if ('btoa' in globalObject) {
      // encode using UTF-8
      const bytes = new TextEncoder().encode(plaintext);

      // decode using UTF-16 (JS's native encoding) since `btoa` requires string input
      const bytesAsString = String.fromCharCode(...bytes);

      // TODO: if TS ever learns about "in", we can get rid of the non-null assertion
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return globalObject.btoa!(bytesAsString);
    }

    // Node
    if ('Buffer' in globalObject) {
      // encode using UTF-8
      // TODO: if TS ever learns about "in", we can get rid of the non-null assertion
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const bytes = globalObject.Buffer!.from(plaintext, 'utf-8');

      // unlike the browser, Node can go straight from bytes to base64
      return bytes.toString('base64');
    }

    // we shouldn't ever get here, because one of `btoa` and `Buffer` should exist, but just in case...
    throw new SentryError('Neither `window.btoa` nor `global.Buffer` is defined.');
  } catch (err) {
    // Cast to a string just in case we're given something else
    const stringifiedInput = JSON.stringify(plaintext);
    const errMsg = `Unable to convert to base64: ${
      stringifiedInput?.length > 256 ? `${stringifiedInput.slice(0, 256)}...` : stringifiedInput
    }.`;
    throw new SentryError(`${errMsg}\nGot error: ${err}`);
  }
}

/**
 * Convert a base64 string to a Unicode string.
 *
 * @param base64String The string to decode
 * @throws SentryError (because using the logger creates a circular dependency)
 * @returns A Unicode string
 */
export function base64ToUnicode(base64String: string): string {
  const globalObject = getGlobalObject<GlobalWithBase64Helpers>();

  // To account for the fact that different platforms use different character encodings natively, our `tracestate` spec
  // calls for all jsonified data to be encoded in UTF-8 bytes before being passed to the base64 encoder. So to reverse
  // the process, decode from base64 to bytes, then feed those bytes to a UTF-8 decoder.
  try {
    if (typeof base64String !== 'string') {
      throw new Error(`Input must be a string. Received input of type '${typeof base64String}'.`);
    }

    // browser
    if ('atob' in globalObject) {
      // `atob` returns a string rather than bytes, so we first need to encode using the native encoding (UTF-16)
      // TODO: if TS ever learns about "in", we can get rid of the non-null assertion
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const bytesAsString = globalObject.atob!(base64String);
      const bytes = [...bytesAsString].map(char => char.charCodeAt(0));

      // decode using UTF-8 (cast the `bytes` arry to a Uint8Array just because that's the format `decode()` expects)
      return new TextDecoder().decode(Uint8Array.from(bytes));
    }

    // Node
    if ('Buffer' in globalObject) {
      // unlike the browser, Node can go straight from base64 to bytes
      // TODO: if TS ever learns about "in", we can get rid of the non-null assertion
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const bytes = globalObject.Buffer!.from(base64String, 'base64');

      // decode using UTF-8
      return bytes.toString('utf-8');
    }

    // we shouldn't ever get here, because one of `atob` and `Buffer` should exist, but just in case...
    throw new SentryError('Neither `window.atob` nor `global.Buffer` is defined.');
  } catch (err) {
    // we cast to a string just in case we're given something else
    const stringifiedInput = JSON.stringify(base64String);
    const errMsg = `Unable to convert from base64: ${
      stringifiedInput?.length > 256 ? `${stringifiedInput.slice(0, 256)}...` : stringifiedInput
    }.`;
    throw new SentryError(`${errMsg}\nGot error: ${err}`);
  }
}
