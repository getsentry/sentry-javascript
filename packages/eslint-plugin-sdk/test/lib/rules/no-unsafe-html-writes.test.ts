import { RuleTester } from 'eslint';
import { describe, test } from 'vitest';
// @ts-expect-error untyped module
import rule from '../../../src/rules/no-unsafe-html-writes';

describe('no-unsafe-html-writes', () => {
  test('ruleTester', () => {
    const ruleTester = new RuleTester({
      parserOptions: {
        ecmaVersion: 2020,
      },
    });

    ruleTester.run('no-unsafe-html-writes', rule, {
      valid: [
        { code: 'const html = document.documentElement.innerHTML;' },
        { code: 'if (el.outerHTML) { use(el.outerHTML); }' },
        { code: 'el.textContent = value;' },
        { code: "const tag = { tagName: 'script', innerHTML: code };" },
        { code: 'stream.write(chunk);' },
        { code: 'el[key] = value;' },
      ],
      invalid: [
        {
          code: 'el.innerHTML = value;',
          errors: [{ messageId: 'htmlProperty', data: { name: 'innerHTML' } }],
        },
        {
          code: 'el.innerHTML += value;',
          errors: [{ messageId: 'htmlProperty', data: { name: 'innerHTML' } }],
        },
        {
          code: "el['outerHTML'] = value;",
          errors: [{ messageId: 'htmlProperty', data: { name: 'outerHTML' } }],
        },
        {
          code: "el.insertAdjacentHTML('beforeend', value);",
          errors: [{ messageId: 'htmlMethod', data: { name: 'insertAdjacentHTML' } }],
        },
        {
          code: 'document.write(value);',
          errors: [{ messageId: 'htmlMethod', data: { name: 'document.write' } }],
        },
        {
          code: 'WINDOW.document.writeln(value);',
          errors: [{ messageId: 'htmlMethod', data: { name: 'document.writeln' } }],
        },
      ],
    });
  });
});
