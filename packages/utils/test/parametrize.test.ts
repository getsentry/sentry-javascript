import type { ParamerizedString } from '../src/parametrize';
import { parametrize } from '../src/parametrize';

describe('parametrize()', () => {
  test('works with empty string', () => {
    const string = new String() as ParamerizedString;
    string.__sentry_template_string__ = '';
    string.__sentry_template_values__ = [];

    const formatted = parametrize``;
    expect(formatted.__sentry_template_string__).toEqual('');
    expect(formatted.__sentry_template_values__).toEqual([]);
  });

  test('works as expected with template literals', () => {
    const x = 'first';
    const y = 'second';
    const string = new String() as ParamerizedString;
    string.__sentry_template_string__ = 'This is a log statement with %s and %s params';
    string.__sentry_template_values__ = ['first', 'second'];

    const formatted = parametrize`This is a log statement with ${x} and ${y} params`;
    expect(formatted.__sentry_template_string__).toEqual(string.__sentry_template_string__);
    expect(formatted.__sentry_template_values__).toEqual(string.__sentry_template_values__);
  });
});
