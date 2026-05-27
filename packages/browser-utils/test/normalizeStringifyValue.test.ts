/**
 * @vitest-environment jsdom
 */
import { getStackAsyncContextStrategy, normalize, setAsyncContextStrategy } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { normalizeStringifyValue } from '../src/normalizeStringifyValue';

// Each test installs the browser stringifier on the async-context strategy and tears
// it down afterwards so unrelated tests don't see a leftover hook on the global carrier.
describe('normalizeStringifyValue (registered via async-context strategy)', () => {
  beforeEach(() => {
    setAsyncContextStrategy({
      ...getStackAsyncContextStrategy(),
      normalizeStringifyValue,
    });
  });

  afterEach(() => {
    setAsyncContextStrategy(undefined);
  });

  test('collapses `window` to `[Window]` (called directly)', () => {
    // In a real browser `window` and `global` are distinct; in jsdom they're aliased,
    // so an integration test through `normalize` would hit core's `[Global]` branch
    // first. Calling the stringifier directly verifies the browser-specific check in
    // isolation.
    // eslint-disable-next-line no-restricted-globals
    expect(normalizeStringifyValue(window)).toBe('[Window]');
  });

  test('collapses `document` to `[Document]`', () => {
    expect(normalize({ d: document })).toEqual({ d: '[Document]' });
  });

  test('renders HTMLDivElement with selector-style path via htmlTreeAsString', () => {
    const div = document.createElement('div');
    div.setAttribute('data-test-id', 'd2');
    div.classList.add('container');
    expect(normalize({ div: document.createElement('div'), div2: div })).toEqual({
      div: '[HTMLElement: div]',
      div2: '[HTMLElement: div.container]',
    });
  });

  test('renders input/select elements with their tag names', () => {
    expect(
      normalize({
        input: document.createElement('input'),
        select: document.createElement('select'),
      }),
    ).toEqual({
      input: '[HTMLElement: input]',
      select: '[HTMLElement: select]',
    });
  });

  test('falls through to default normalization for non-DOM values', () => {
    // Strings/numbers/regular objects must not be intercepted by the browser stringifier.
    expect(normalize({ a: 'string', b: 42, c: { nested: true } })).toEqual({
      a: 'string',
      b: 42,
      c: { nested: true },
    });
  });

  test('does not handle Vue or React framework values (those belong to vue/react SDKs)', () => {
    // A Vue-like object passes through unchanged; only Vue SDK's wrap would collapse it.
    expect(normalize({ vm: { _isVue: true, foo: 'bar' } })).toEqual({
      vm: { _isVue: true, foo: 'bar' },
    });
    // A SyntheticEvent-like plain object likewise; only React SDK's wrap would collapse it.
    expect(
      normalize({
        e: { nativeEvent: 'x', preventDefault: 'fn', stopPropagation: 'fn' },
      }),
    ).toEqual({
      e: { nativeEvent: 'x', preventDefault: 'fn', stopPropagation: 'fn' },
    });
  });
});
