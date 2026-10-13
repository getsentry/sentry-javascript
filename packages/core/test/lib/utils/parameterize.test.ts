import { describe, expect, test } from 'vitest';
import type { ParameterizedString } from '../../../src/types/parameterize';
import { parameterize } from '../../../src/utils/parameterize';

describe('parameterize()', () => {
  test('works with empty string', () => {
    const string = new String() as ParameterizedString;
    string.__sentry_template_string__ = '';
    string.__sentry_template_values__ = [];

    const formatted = parameterize``;
    expect(formatted.__sentry_template_string__).toEqual('');
    expect(formatted.__sentry_template_values__).toEqual([]);
  });

  test('works as expected with template literals', () => {
    const x = 'first';
    const y = 'second';
    const string = new String() as ParameterizedString;
    string.__sentry_template_string__ = 'This is a log statement with %s and %s params';
    string.__sentry_template_values__ = ['first', 'second'];

    const formatted = parameterize`This is a log statement with ${x} and ${y} params`;
    expect(formatted.__sentry_template_string__).toEqual(string.__sentry_template_string__);
    expect(formatted.__sentry_template_values__).toEqual(string.__sentry_template_values__);
  });

  test('keeps escape sequences the same in the message and the template', () => {
    const x = 'first';
    const formatted = parameterize`Line one\nline two with ${x} → \`done\``;

    expect(String(formatted)).toBe('Line one\nline two with first → `done`');
    expect(formatted.__sentry_template_string__).toBe('Line one\nline two with %s → `done`');
  });

  test('keeps the raw text of a string with an invalid escape sequence', () => {
    const file = 'app.log';
    const formatted = parameterize`Reading C:\users ${file}`;

    expect(String(formatted)).toBe('Reading C:\\users app.log');
    expect(formatted.__sentry_template_string__).toBe('Reading C:\\users %s');
  });
});
