import { RuleTester } from 'eslint';
import { describe, test } from 'vitest';
// @ts-expect-error untyped module
import rule from '../../../src/rules/no-unsafe-random-apis';

describe('no-unsafe-random-apis', () => {
  test('ruleTester', () => {
    const ruleTester = new RuleTester({
      parserOptions: {
        ecmaVersion: 2020,
      },
    });

    ruleTester.run('no-unsafe-random-apis', rule, {
      valid: [
        // Wrapped with withRandomSafeContext - arrow function
        {
          code: 'withRandomSafeContext(() => Date.now())',
        },
        {
          code: 'withRandomSafeContext(() => Math.random())',
        },
        {
          code: 'withRandomSafeContext(() => performance.now())',
        },
        {
          code: 'withRandomSafeContext(() => crypto.randomUUID())',
        },
        {
          code: 'withRandomSafeContext(() => crypto.getRandomValues(new Uint8Array(16)))',
        },
        // Wrapped with withRandomSafeContext - regular function
        {
          code: 'withRandomSafeContext(function() { return Date.now(); })',
        },
        // Nested inside withRandomSafeContext
        {
          code: 'withRandomSafeContext(() => { const x = Date.now(); return x + Math.random(); })',
        },
        // Expression inside withRandomSafeContext
        {
          code: 'withRandomSafeContext(() => Date.now() / 1000)',
        },
        // Other unrelated calls should be fine
        {
          code: 'const x = someObject.now()',
        },
        {
          code: 'const x = Date.parse("2021-01-01")',
        },
        {
          code: 'const x = Math.floor(5.5)',
        },
        {
          code: 'const x = performance.mark("test")',
        },
      ],
      invalid: [
        // Direct Date.now() calls
        {
          code: 'const time = Date.now()',
          errors: [
            {
              messageId: 'unsafeDateNow',
            },
          ],
        },
        // Direct Math.random() calls
        {
          code: 'const random = Math.random()',
          errors: [
            {
              messageId: 'unsafeMathRandom',
            },
          ],
        },
        // Direct performance.now() calls
        {
          code: 'const perf = performance.now()',
          errors: [
            {
              messageId: 'unsafePerformanceNow',
            },
          ],
        },
        // Direct crypto.randomUUID() calls
        {
          code: 'const uuid = crypto.randomUUID()',
          errors: [
            {
              messageId: 'unsafeCryptoRandomUUID',
            },
          ],
        },
        // Direct crypto.getRandomValues() calls
        {
          code: 'const bytes = crypto.getRandomValues(new Uint8Array(16))',
          errors: [
            {
              messageId: 'unsafeCryptoGetRandomValues',
            },
          ],
        },
        // Inside a function but not wrapped
        {
          code: 'function getTime() { return Date.now(); }',
          errors: [
            {
              messageId: 'unsafeDateNow',
            },
          ],
        },
        // Inside an arrow function but not wrapped with withRandomSafeContext
        {
          code: 'const getTime = () => Date.now()',
          errors: [
            {
              messageId: 'unsafeDateNow',
            },
          ],
        },
        // Inside someOtherWrapper
        {
          code: 'someOtherWrapper(() => Date.now())',
          errors: [
            {
              messageId: 'unsafeDateNow',
            },
          ],
        },
        // Multiple violations
        {
          code: 'const a = Date.now(); const b = Math.random();',
          errors: [
            {
              messageId: 'unsafeDateNow',
            },
            {
              messageId: 'unsafeMathRandom',
            },
          ],
        },
      ],
    });
  });
});
