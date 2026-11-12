/**
 * @vitest-environment node
 */
import { JSDOM } from 'jsdom';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { stringifyForCodeInjection } from '../../../src/build-time-plugins/stringifyForCodeInjection';

describe('stringifyForCodeInjection', () => {
  it.each([
    '</script><script>globalThis.injected = true</script>',
    '</ScRiPt \n><script>globalThis.injected = true</script>',
    '<!--<script>',
    '--> after a comment',
    'quotes "\' and backslashes \\u003c with whitespace \n\r\t\u2028\u2029 and <>&',
  ])('keeps %j inside one script element, with the same value', value => {
    const input = { [value]: [value, { nested: value }] };
    const code = `globalThis.result = ${stringifyForCodeInjection(input)};`;

    const dom = new JSDOM(`<script>${code}</script>`);
    const scripts = dom.window.document.querySelectorAll('script');
    dom.window.close();

    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.textContent).toBe(code);

    const context: { result?: unknown } = {};
    runInNewContext(code, context);
    expect(context.result).toEqual(input);
  });

  it('escapes the unsafe characters', () => {
    expect(stringifyForCodeInjection('<>\u2028\u2029')).toBe('"\\u003c\\u003e\\u2028\\u2029"');
  });

  it('gives the same result as JSON.stringify for other values', () => {
    const value = { a: [1, 'two', null, true], b: { c: 'd/e\\f' } };
    expect(stringifyForCodeInjection(value)).toBe(JSON.stringify(value));
    expect(stringifyForCodeInjection(value, null, 2)).toBe(JSON.stringify(value, null, 2));
    expect(stringifyForCodeInjection(value, ['a'])).toBe(JSON.stringify(value, ['a']));
    expect(stringifyForCodeInjection(value, (_key, v) => (v === 'two' ? 2 : v))).toBe(
      JSON.stringify(value, (_key, v) => (v === 'two' ? 2 : v)),
    );
  });

  it('returns undefined where JSON.stringify does', () => {
    expect(stringifyForCodeInjection(undefined)).toBeUndefined();
    expect(stringifyForCodeInjection(() => undefined)).toBeUndefined();
  });
});
