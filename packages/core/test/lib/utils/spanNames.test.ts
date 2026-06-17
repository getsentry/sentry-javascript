import { describe, expect, it } from 'vitest';

import { buildSpanName } from '../../../src/utils/spanNames';

describe('buildSpanName', () => {
  it('returns first matching template populated with data', () => {
    expect(
      buildSpanName(['{method} {url}', '{method} {host}', '{method} {path}'], {
        method: 'GET',
        host: 'example.com',
      }),
    ).toBe('GET example.com');
  });

  it('ignores matching keys with empty values', () => {
    expect(
      buildSpanName(['{method} {url}', '{method} {host}', '{method} {path}', 'fallback'], {
        method: '',
        host: 'example.com',
      }),
    ).toBe('fallback');
  });

  it('returns an empty string if no templates are provided', () => {
    expect(buildSpanName([], { method: 'GET', host: 'example.com' })).toBe('');
  });

  it('returns a static template with no placeholders', () => {
    expect(buildSpanName(['static name'], {})).toBe('static name');
  });

  it('ignores keys whose values are only whitespace', () => {
    expect(buildSpanName(['{method} {host}', 'fallback'], { method: '   ', host: 'example.com' })).toBe('fallback');
  });

  it('returns an empty string when no template can be fully populated', () => {
    expect(buildSpanName(['{method} {url}'], { host: 'example.com' })).toBe('');
  });

  it('replaces repeated placeholders', () => {
    expect(buildSpanName(['{method} {method}'], { method: 'GET' })).toBe('GET GET');
  });

  it('skips templates with missing keys and uses the next viable one', () => {
    expect(buildSpanName(['{method} {url}', '{method} {host}'], { method: 'GET', host: 'example.com' })).toBe(
      'GET example.com',
    );
  });

  it('ignores extra keys in data not referenced by the template', () => {
    expect(buildSpanName(['{method}'], { method: 'GET', unused: 'x' })).toBe('GET');
  });

  it('ignores non-string values', () => {
    // For the moment, I think this behaviour is fine, since I'm not aware of a use case where
    // we'd want create a span name from a non-string value (e.g. span attribute). If we do,
    // we can easily address this by changing the behavior to stringify data values.
    expect(
      buildSpanName(
        [
          '{number}',
          '{boolean}',
          '{object}',
          '{array}',
          '{function}',
          '{symbol}',
          '{bigint}',
          '{throw}',
          '{proxy}',
          'fallback',
        ],
        {
          number: 123,
          boolean: true,
          object: { a: 1 },
          array: [1, 2, 3],
          function: () => {},
          symbol: Symbol('test'),
          bigint: BigInt(123),
          throw: () => {
            throw new Error('test');
          },
          proxy: new Proxy(
            {},
            {
              get: () => {
                throw new Error('test');
              },
            },
          ),
        },
      ),
    ).toBe('fallback');
  });

  it('handles keys containing other keys', () => {
    expect(
      buildSpanName(['{url} {url.full} {url}'], { url: 'example.com', 'url.full': 'https://example.com/api/users' }),
    ).toBe('example.com https://example.com/api/users example.com');
    expect(
      buildSpanName(['{url.full} {url} {url.full}'], {
        url: 'example.com',
        'url.full': 'https://example.com/api/users',
      }),
    ).toBe('https://example.com/api/users example.com https://example.com/api/users');
  });
});
