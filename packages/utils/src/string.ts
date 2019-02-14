import { isString } from './is';

/**
 * Truncates given string to the maximum characters count
 *
 * @param str An object that contains serializable values
 * @param max Maximum number of characters in truncated string
 * @returns string Encoded
 */
export function truncate(str: string, max: number = 0): string {
  if (max === 0 || !isString(str)) {
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
    colno = ll; // tslint:disable-line:no-parameter-reassignment
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
export function safeJoin(input: any[], delimiter?: string): string {
  if (!Array.isArray(input)) {
    return '';
  }

  const output = [];
  // tslint:disable-next-line:prefer-for-of
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
 * Checks if given value is included in the target
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes#Polyfill
 * @param target source string
 * @param search string to be looked for
 * @returns An answer
 */
export function includes(target: string, search: string): boolean {
  if (search.length > target.length) {
    return false;
  } else {
    return target.indexOf(search) !== -1;
  }
}
