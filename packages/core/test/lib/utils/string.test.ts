import { afterEach, describe, expect, test, vi } from 'vitest';
import { setNormalizeStringifier } from '../../../src';
import { isMatchingPattern, safeJoin, stringMatchesSomePattern, truncate } from '../../../src/utils/string';

describe('truncate()', () => {
  test('it works as expected', () => {
    expect(truncate('lolol', 3)).toEqual('lol...');
    expect(truncate('lolol', 10)).toEqual('lolol');
    expect(truncate('1'.repeat(1000), 300)).toHaveLength(303);
    expect(truncate(new Array(1000).join('f'), 0)).toEqual(new Array(1000).join('f'));
    expect(truncate(new Array(1000).join('f'), 0)).toEqual(new Array(1000).join('f'));
  });

  test('should bail out as an identity function when given non-string value', () => {
    expect(truncate(null as any, 3)).toEqual(null);
    expect(truncate(undefined as any, 3)).toEqual(undefined);
    expect(truncate({} as any, 3)).toEqual({});
    expect(truncate([] as any, 3)).toEqual([]);
  });
});

describe('isMatchingPattern()', () => {
  test('match using string substring if `requireExactStringMatch` not given', () => {
    expect(isMatchingPattern('foobar', 'foobar')).toEqual(true);
    expect(isMatchingPattern('foobar', 'foo')).toEqual(true);
    expect(isMatchingPattern('foobar', 'bar')).toEqual(true);
    expect(isMatchingPattern('foobar', 'nope')).toEqual(false);
  });

  test('match using string substring if `requireExactStringMatch` is `false`', () => {
    expect(isMatchingPattern('foobar', 'foobar', false)).toEqual(true);
    expect(isMatchingPattern('foobar', 'foo', false)).toEqual(true);
    expect(isMatchingPattern('foobar', 'bar', false)).toEqual(true);
    expect(isMatchingPattern('foobar', 'nope', false)).toEqual(false);
  });

  test('match using exact string match if `requireExactStringMatch` is `true`', () => {
    expect(isMatchingPattern('foobar', 'foobar', true)).toEqual(true);
    expect(isMatchingPattern('foobar', 'foo', true)).toEqual(false);
    expect(isMatchingPattern('foobar', 'nope', true)).toEqual(false);
  });

  test('matches when `value` contains `pattern` but not vice-versa', () => {
    expect(isMatchingPattern('foobar', 'foo')).toEqual(true);
    expect(isMatchingPattern('foobar', 'foobarbaz')).toEqual(false);
  });

  test('match using regexp test', () => {
    expect(isMatchingPattern('foobar', /^foo/)).toEqual(true);
    expect(isMatchingPattern('foobar', /foo/)).toEqual(true);
    expect(isMatchingPattern('foobar', /b.{1}r/)).toEqual(true);
    expect(isMatchingPattern('foobar', /^foo$/)).toEqual(false);
  });

  test('should match empty pattern as true', () => {
    expect(isMatchingPattern('foo', '')).toEqual(true);
    expect(isMatchingPattern('bar', '')).toEqual(true);
    expect(isMatchingPattern('', '')).toEqual(true);
  });

  test('should call a method that returns boolean result', () => {
    const testTrue = vi.fn(() => true);
    const testFalse = vi.fn(() => false);
    expect(isMatchingPattern('x', testTrue)).toEqual(true);
    expect(testTrue).toHaveBeenCalledExactlyOnceWith('x');
    expect(isMatchingPattern('y', testFalse)).toEqual(false);
    expect(testFalse).toHaveBeenCalledExactlyOnceWith('y');
  });

  test('should bail out with false when given non-string value', () => {
    expect(isMatchingPattern(null as any, 'foo')).toEqual(false);
    expect(isMatchingPattern(undefined as any, 'foo')).toEqual(false);
    expect(isMatchingPattern({} as any, 'foo')).toEqual(false);
    expect(isMatchingPattern([] as any, 'foo')).toEqual(false);
  });
});

describe('stringMatchesSomePattern()', () => {
  test('match using string substring if `requireExactStringMatch` not given', () => {
    expect(stringMatchesSomePattern('foobar', ['foobar', 'nope'])).toEqual(true);
    expect(stringMatchesSomePattern('foobar', ['foo', 'nope'])).toEqual(true);
    expect(stringMatchesSomePattern('foobar', ['baz', 'nope'])).toEqual(false);
  });

  test('match using string substring if `requireExactStringMatch` is `false`', () => {
    expect(stringMatchesSomePattern('foobar', ['foobar', 'nope'], false)).toEqual(true);
    expect(stringMatchesSomePattern('foobar', ['foo', 'nope'], false)).toEqual(true);
    expect(stringMatchesSomePattern('foobar', ['baz', 'nope'], false)).toEqual(false);
  });

  test('match using exact string match if `requireExactStringMatch` is `true`', () => {
    expect(stringMatchesSomePattern('foobar', ['foobar', 'nope'], true)).toEqual(true);
    expect(stringMatchesSomePattern('foobar', ['foo', 'nope'], true)).toEqual(false);
    expect(stringMatchesSomePattern('foobar', ['baz', 'nope'], true)).toEqual(false);
  });

  test('matches when `testString` contains a pattern but not vice-versa', () => {
    expect(stringMatchesSomePattern('foobar', ['foo', 'nope'])).toEqual(true);
    expect(stringMatchesSomePattern('foobar', ['foobarbaz', 'nope'])).toEqual(false);
  });

  test('match using regexp test', () => {
    expect(stringMatchesSomePattern('foobar', [/^foo/, 'nope'])).toEqual(true);
    expect(stringMatchesSomePattern('foobar', [/foo/, 'nope'])).toEqual(true);
    expect(stringMatchesSomePattern('foobar', [/b.{1}r/, 'nope'])).toEqual(true);
    expect(stringMatchesSomePattern('foobar', [/^foo$/, 'nope'])).toEqual(false);
  });

  test('should match empty pattern as true', () => {
    expect(stringMatchesSomePattern('foo', ['', 'nope'])).toEqual(true);
    expect(stringMatchesSomePattern('bar', ['', 'nope'])).toEqual(true);
    expect(stringMatchesSomePattern('', ['', 'nope'])).toEqual(true);
  });

  test('should bail out with false when given non-string value', () => {
    expect(stringMatchesSomePattern(null as any, ['foo', 'nope'])).toEqual(false);
    expect(stringMatchesSomePattern(undefined as any, ['foo', 'nope'])).toEqual(false);
    expect(stringMatchesSomePattern({} as any, ['foo', 'nope'])).toEqual(false);
    expect(stringMatchesSomePattern([] as any, ['foo', 'nope'])).toEqual(false);
  });
});

describe('safeJoin()', () => {
  afterEach(() => {
    // Some tests register a stringifier via `setNormalizeStringifier`; reset so we don't
    // leak into unrelated tests sharing this module's global state.
    setNormalizeStringifier(undefined);
    vi.unstubAllGlobals();
  });

  test('joins primitive values with the given delimiter', () => {
    expect(safeJoin(['a', 'b', 'c'], '-')).toEqual('a-b-c');
    expect(safeJoin([1, 2, 3], '+')).toEqual('1+2+3');
  });

  test('defaults to comma-joining when no delimiter is provided', () => {
    expect(safeJoin(['a', 'b', 'c'])).toEqual('a,b,c');
  });

  test('returns an empty string for an empty array', () => {
    expect(safeJoin([], '-')).toEqual('');
    expect(safeJoin([])).toEqual('');
  });

  test('returns an empty string when input is not an array', () => {
    expect(safeJoin(null as any)).toEqual('');
    expect(safeJoin(undefined as any)).toEqual('');
    expect(safeJoin('not-an-array' as any)).toEqual('');
    expect(safeJoin(42 as any)).toEqual('');
    expect(safeJoin({} as any)).toEqual('');
  });

  test('stringifies primitive non-string values via `String(...)`', () => {
    // `null` / `undefined` / `true` / `false` / `NaN` go through the primitive branch
    // and are coerced with `String(...)` — which is different from what `normalize`
    // would render (e.g. `'NaN'` here vs. `'[NaN]'` in normalized output).
    expect(safeJoin([null, undefined, true, false, NaN], '|')).toEqual('null|undefined|true|false|NaN');
  });

  test('stringifies symbols and bigints via `String(...)`', () => {
    expect(safeJoin([Symbol('foo'), BigInt(42)], '|')).toEqual('Symbol(foo)|42');
  });

  test('routes non-primitive values through `stringifyValue`', () => {
    // Functions → `[Function: <name>]`. Plain objects → `[object Object]`.
    function namedFn(): void {
      /* no-empty */
    }
    expect(safeJoin([{ a: 1 }, namedFn], ' / ')).toEqual('[object Object] / [Function: namedFn]');
  });

  test('renders Errors via their constructor name & message', () => {
    // Errors take the non-primitive branch and end up in `stringifyValue`'s
    // `[object <ConstructorName>]` fallback.
    expect(safeJoin([new Error('Boom'), new TypeError('Bad arg')], ' | ')).toEqual('Error: Boom | TypeError: Bad arg');
  });

  test('mixes primitives and objects in the same join', () => {
    expect(safeJoin(['count:', 3, { ok: true }], ' ')).toEqual('count: 3 [object Object]');
  });

  test('honors a custom stringifier registered via `setNormalizeStringifier`', () => {
    const stub = vi.fn((value: unknown): string | undefined => {
      if (typeof value === 'object' && value !== null && (value as { mark?: unknown }).mark === true) {
        return '[Marked]';
      }
      return undefined;
    });
    setNormalizeStringifier(stub);

    expect(safeJoin([{ mark: true }, 'tail', { plain: 1 }], '/')).toEqual('[Marked]/tail/[object Object]');
    expect(stub).toHaveBeenCalled();
  });

  test('does not invoke getters or the stringifier for DOM elements (#21353)', () => {
    // Capturing a console breadcrumb must be side-effect free. For DOM elements,
    // routing through `stringifyValue` would call the browser stringifier's
    // `htmlTreeAsString`, which reads `id`/`className`/`getAttribute` — invoking
    // user-defined getters. `safeJoin` must short-circuit elements via `String(...)`.
    class FakeElement {}
    vi.stubGlobal('Element', FakeElement);

    let getterInvoked = false;
    const element = new FakeElement();
    Object.defineProperty(element, 'id', {
      get() {
        getterInvoked = true;
        return 'devtools-trap';
      },
    });

    // Emulate the browser stringifier reading element attributes.
    const stringifier = vi.fn((value: unknown): string => {
      void (value as { id?: unknown }).id;
      return '[HTMLElement: ...]';
    });
    setNormalizeStringifier(stringifier);

    const result = safeJoin([element], ' ');

    expect(getterInvoked).toBe(false);
    expect(stringifier).not.toHaveBeenCalled();
    expect(result).toBe(String(element));
  });

  test('supports an empty delimiter', () => {
    expect(safeJoin(['a', 'b', 'c'], '')).toEqual('abc');
  });
});
