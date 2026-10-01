import type { ParameterizedString } from '../types/parameterize';

/**
 * Tagged template function which returns parameterized representation of the message
 * For example: parameterize`This is a log statement with ${x} and ${y} params`, would return:
 * "__sentry_template_string__": 'This is a log statement with %s and %s params',
 * "__sentry_template_values__": ['first', 'second']
 *
 * @param strings An array of string values splitted between expressions
 * @param values Expressions extracted from template string
 *
 * @returns A `ParameterizedString` object that can be passed into `captureMessage` or Sentry.logger.X methods.
 */
export function parameterize(strings: TemplateStringsArray, ...values: unknown[]): ParameterizedString {
  // `String.raw` would keep escape sequences such as `\n` as typed, while the template uses the cooked strings.
  // A string with an invalid escape sequence has no cooked value, so fall back to its raw form.
  const cooked = strings.map((str, i) => str ?? strings.raw[i]);
  const formatted = new String(String.raw({ raw: cooked }, ...values)) as ParameterizedString;
  formatted.__sentry_template_string__ = cooked.join('\x00').replace(/%/g, '%%').replace(/\0/g, '%s');
  formatted.__sentry_template_values__ = values;
  return formatted;
}

/**
 * Tagged template function which returns parameterized representation of the message.
 *
 * @param strings An array of string values splitted between expressions
 * @param values Expressions extracted from template string
 * @returns A `ParameterizedString` object that can be passed into `captureMessage` or Sentry.logger.X methods.
 */
export const fmt = parameterize;
