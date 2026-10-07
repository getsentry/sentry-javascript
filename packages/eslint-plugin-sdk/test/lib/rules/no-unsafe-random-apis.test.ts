import { RuleTester } from 'eslint';
import { describe, expect, test } from 'vitest';
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
        // `new Date(<value>)` does not read the ambient clock and is safe
        {
          code: 'const d = new Date(safeDateNow())',
        },
        {
          code: 'const d = new Date(1234567890)',
        },
        {
          code: 'const d = new Date("2021-01-01")',
        },
        {
          code: 'withRandomSafeContext(() => new Date())',
        },
        {
          code: '_INTERNAL_withRandomSafeContext(() => performance.now())',
        },
        {
          code: 'withRandomSafeContext(() => globalThis.performance.now())',
        },
        {
          code: 'withRandomSafeContext(() => performance?.now())',
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
        // Bare `new Date()` constructor reads the ambient clock
        {
          code: 'const now = new Date()',
          errors: [
            {
              messageId: 'unsafeDateConstructor',
            },
          ],
        },
        {
          code: 'const iso = new Date().toISOString()',
          errors: [
            {
              messageId: 'unsafeDateConstructor',
            },
          ],
        },
        {
          code: 'someOtherWrapper(() => new Date())',
          errors: [
            {
              messageId: 'unsafeDateConstructor',
            },
          ],
        },
        // Optional chaining
        {
          code: 'const perf = performance?.now()',
          errors: [{ messageId: 'unsafePerformanceNow' }],
        },
        {
          code: 'const uuid = crypto?.randomUUID?.()',
          errors: [{ messageId: 'unsafeCryptoRandomUUID' }],
        },
        // Access through a global object
        {
          code: 'const perf = globalThis.performance.now()',
          errors: [{ messageId: 'unsafePerformanceNow' }],
        },
        {
          code: 'const uuid = GLOBAL_OBJ.crypto.randomUUID()',
          errors: [{ messageId: 'unsafeCryptoRandomUUID' }],
        },
        {
          code: 'const perf = WINDOW.performance?.now()',
          errors: [{ messageId: 'unsafePerformanceNow' }],
        },
        {
          code: 'const random = Math["random"]()',
          errors: [{ messageId: 'unsafeMathRandom' }],
        },
      ],
    });
  });

  // RuleTester can't parse TypeScript syntax: the repo has no working TypeScript parser for ESLint
  // (`@typescript-eslint/parser@5` can't run against `typescript@7`), so we drive the visitors with
  // the AST shape that oxlint produces.
  describe('TypeScript syntax', () => {
    function withParents(node: any, parent: any = null): any {
      node.parent = parent;
      for (const [key, value] of Object.entries(node)) {
        if (key === 'parent') continue;
        for (const child of Array.isArray(value) ? value : [value]) {
          if (child && typeof child.type === 'string') withParents(child, node);
        }
      }
      return node;
    }

    function run(root: any): string[] {
      const messageIds: string[] = [];
      const visitor = rule.create({
        report: ({ messageId }: { messageId: string }) => messageIds.push(messageId),
      });
      (function walk(node: any) {
        visitor[node.type]?.(node);
        for (const [key, value] of Object.entries(node)) {
          if (key === 'parent') continue;
          for (const child of Array.isArray(value) ? value : [value]) {
            if (child && typeof child.type === 'string') walk(child);
          }
        }
      })(withParents(root));
      return messageIds;
    }

    const id = (name: string) => ({ type: 'Identifier', name });
    const member = (object: unknown, property: string) => ({
      type: 'MemberExpression',
      object,
      property: id(property),
      computed: false,
      optional: false,
    });
    const call = (callee: unknown) => ({ type: 'CallExpression', callee, arguments: [], optional: false });
    const nonNull = (expression: unknown) => ({ type: 'TSNonNullExpression', expression });
    const as = (expression: unknown) => ({ type: 'TSAsExpression', expression, typeAnnotation: null });
    const statement = (expression: unknown) => ({
      type: 'Program',
      body: [{ type: 'ExpressionStatement', expression }],
    });

    test('reports `crypto.randomUUID!()`', () => {
      expect(run(statement(call(nonNull(member(id('crypto'), 'randomUUID')))))).toEqual(['unsafeCryptoRandomUUID']);
    });

    test('reports `(globalThis as any).performance.now()`', () => {
      expect(run(statement(call(member(member(as(id('globalThis')), 'performance'), 'now'))))).toEqual([
        'unsafePerformanceNow',
      ]);
    });

    test('allows `withRandomSafeContext(() => crypto.randomUUID!())`', () => {
      const callback = {
        type: 'ArrowFunctionExpression',
        params: [],
        body: call(nonNull(member(id('crypto'), 'randomUUID'))),
      };
      expect(run(statement({ ...call(id('withRandomSafeContext')), arguments: [callback] }))).toEqual([]);
    });
  });
});
