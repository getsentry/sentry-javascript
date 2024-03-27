import { RuleTester } from 'eslint';
import { describe } from 'vitest';

// @ts-expect-error untyped module
import rule from '../../../src/rules/no-eq-empty';

describe('no-eq-empty', () => {
  test('ruleTester', () => {
    const arrayMessage = 'Do not apply the equality operator on an empty array. Use .length or Array.isArray instead.';
    const objectMessage = 'Do not apply the equality operator on an empty object.';

    const ruleTester = new RuleTester({
      parserOptions: {
        ecmaVersion: 8,
      },
    });

    ruleTester.run('no-eq-empty', rule, {
      valid: [
        {
          code: 'const hey = [] === []',
        },
        {
          code: 'const hey = [] == []',
        },
        {
          code: 'const hey = {} === {}',
        },
        {
          code: 'const hey = {} == {}',
        },
      ],
      invalid: [
        {
          code: 'empty === []',
          errors: [
            {
              message: arrayMessage,
              type: 'BinaryExpression',
            },
          ],
        },
        {
          code: 'empty == []',
          errors: [
            {
              message: arrayMessage,
              type: 'BinaryExpression',
            },
          ],
        },
        {
          code: 'const hey = function() {}() === []',
          errors: [
            {
              message: arrayMessage,
              type: 'BinaryExpression',
            },
          ],
        },
        {
          code: 'empty === {}',
          errors: [
            {
              message: objectMessage,
              type: 'BinaryExpression',
            },
          ],
        },
        {
          code: 'empty == {}',
          errors: [
            {
              message: objectMessage,
              type: 'BinaryExpression',
            },
          ],
        },
        {
          code: 'const hey = function(){}() === {}',
          errors: [
            {
              message: objectMessage,
              type: 'BinaryExpression',
            },
          ],
        },
      ],
    });
  });
});
