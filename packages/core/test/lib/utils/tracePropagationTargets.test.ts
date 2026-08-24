import { describe, expect, it } from 'vitest';
import type { TracePropagationTargets } from '../../../src/types/tracing';
import { LRUMap } from '../../../src/utils/lru';
import { matchesTracePropagationTargets, shouldPropagateTraceForUrl } from '../../../src/utils/tracePropagationTargets';

describe('matchesTracePropagationTargets', () => {
  it.each([
    // string targets, matching casing
    ['https://myapi.com/v1', ['myapi.com/'], true],
    ['https://myapi.com/v1', ['other.com/'], false],

    // string targets, mismatched casing
    ['https://myapi.com/v1', ['myApi.com/'], true],
    ['https://myApi.com/v1', ['myapi.com/'], true],
    ['https://MYAPI.COM/v1', ['myapi.com/'], true],
    ['https://myapi.com/API/v1', ['/api/'], true],
    ['https://myapi.com/api/v1', ['/API/'], true],

    // regex targets, matching casing
    [String.raw`https://myapi.com/v1`, [/^https:\/\/myapi\.com\//], true],
    [String.raw`https://myapi.com/v1`, [/^https:\/\/other\.com\//], false],

    // regex targets, mismatched casing
    [String.raw`https://myapi.com/v1`, [/^https:\/\/myApi\.com\//], true],
    [String.raw`https://myApi.com/v1`, [/^https:\/\/myapi\.com\//], true],
    [String.raw`https://myapi.com/API/v1`, [/\/api\//], true],

    // regexes that already ignore case keep working
    [String.raw`https://myapi.com/v1`, [/^https:\/\/myAPI\.com\//i], true],

    // a non-matching target stays non-matching regardless of casing
    [String.raw`https://myapi.com/v1`, ['MYOTHERAPI.COM/', /^https:\/\/OTHER\.com\//], false],

    // mixed target lists
    ['https://myapi.com/v1', ['other.com/', /^https:\/\/myApi\.com\//], true],

    // empty target list never matches
    ['https://myapi.com/v1', [], false],
  ])('for url %j and targets %j returns %j', (url, targets, expected) => {
    expect(matchesTracePropagationTargets(url, targets)).toBe(expected);
  });

  it.each([[123], [null], [undefined], [{}], [() => true]])(
    'returns false instead of throwing for the unsupported target %j',
    target => {
      // `tracePropagationTargets` is typed as `(string | RegExp)[]`, but it is frequently set from plain JS,
      // and throwing here would break the instrumented request itself.
      expect(matchesTracePropagationTargets('https://myapi.com', [target] as unknown as TracePropagationTargets)).toBe(
        false,
      );
    },
  );

  it('matches boxed strings', () => {
    // eslint-disable-next-line no-new-wrappers
    const target = new String('myApi.com/') as unknown as string;

    expect(matchesTracePropagationTargets('https://myapi.com/v1', [target])).toBe(true);
  });

  it('does not mutate the flags of the passed regex', () => {
    const target = /^https:\/\/myApi\.com\//;

    expect(matchesTracePropagationTargets('https://myapi.com/v1', [target])).toBe(true);
    expect(target.ignoreCase).toBe(false);
    expect(target.flags).toBe('');
  });

  it('preserves other flags when adding case insensitivity', () => {
    expect(matchesTracePropagationTargets('https://myapi.com/v1', [/MYAPI\.com\/v1$/m])).toBe(true);
  });

  it('matches consistently across repeated calls for the same regex', () => {
    const target = /myApi\.com\//g;

    expect(matchesTracePropagationTargets('https://myapi.com/v1', [target])).toBe(true);
    expect(matchesTracePropagationTargets('https://myapi.com/v2', [target])).toBe(true);
  });
});

describe('shouldPropagateTraceForUrl', () => {
  it('propagates when no targets are defined', () => {
    expect(shouldPropagateTraceForUrl('https://myapi.com', undefined)).toBe(true);
  });

  it('propagates when no url is defined', () => {
    expect(shouldPropagateTraceForUrl(undefined, ['myapi.com/'])).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(shouldPropagateTraceForUrl('https://myapi.com/v1', ['myApi.com/'])).toBe(true);
    expect(shouldPropagateTraceForUrl('https://myApi.com/v1', [/^https:\/\/myapi\.com\//])).toBe(true);
  });

  it('caches the decision per url', () => {
    const decisionMap = new LRUMap<string, boolean>(10);

    expect(shouldPropagateTraceForUrl('https://myapi.com/v1', ['myApi.com/'], decisionMap)).toBe(true);
    expect(decisionMap.get('https://myapi.com/v1')).toBe(true);
    expect(shouldPropagateTraceForUrl('https://myapi.com/v1', ['myApi.com/'], decisionMap)).toBe(true);
  });
});
