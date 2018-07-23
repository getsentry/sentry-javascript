import { isString } from './is';

/**
 * Encodes given object into url-friendly format
 *
 * @param str An object that contains serializable values
 * @param max Maximum number of characters in truncated string
 * @returns string Encoded
 */

export function truncate(str: string, max: number): string {
  if (max === 0) {
    return str;
  }
  return str.length <= max ? str : `${str.substr(0, max)}\u2026`;
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

  for (const value of input) {
    try {
      output.push(String(value));
    } catch (e) {
      output.push('[value cannot be serialized]');
    }
  }

  return output.join(delimiter);
}

/**
 * Combine an array of regular expressions and strings into one large regexp
 */
export function joinRegExp(patterns: Array<RegExp | string>): RegExp {
  const joinedPattern = Array.isArray(patterns)
    ? patterns
        .map(pattern => {
          if (isString(pattern)) {
            // If it's a string, we need to escape it
            // Taken from: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
            return (pattern as string).replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1');
          } else if (pattern && (pattern as RegExp).source) {
            // If it's a regexp already, we want to extract the source
            return (pattern as RegExp).source;
          }
          // Intentionally skip other cases
          return undefined;
        })
        .filter(x => !!x)
        .join('|')
    : '';

  return new RegExp(joinedPattern, 'i');
}
