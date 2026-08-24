import { RuleTester } from 'eslint';
import { describe, expect, test } from 'vitest';
// @ts-expect-error untyped module
import rule from '../../../src/rules/no-unguarded-span-apis';

const BROWSER_FILE = '/repo/packages/browser/src/tracing/request.ts';

describe('no-unguarded-span-apis', () => {
  test('ruleTester', () => {
    const ruleTester = new RuleTester({
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    });

    ruleTester.run('no-unguarded-span-apis', rule, {
      valid: [
        // The guarded entry point is the whole point of the rule.
        {
          filename: BROWSER_FILE,
          code: "import { startSpan } from '@sentry/core/browser';",
        },
        {
          filename: BROWSER_FILE,
          code: "import { startSpan } from '@sentry/browser';",
        },
        // Non-span imports from the root entry stay fine - browser code has plenty of those.
        {
          filename: BROWSER_FILE,
          code: "import { debug, spanToJSON } from '@sentry/core';",
        },
        // Server, edge and build-time code must keep using the plain variants.
        {
          filename: '/repo/packages/node/src/sdk/index.ts',
          code: "import { startSpan } from '@sentry/core';",
        },
        {
          filename: '/repo/packages/nextjs/src/server/index.ts',
          code: "import { startSpan } from '@sentry/core';",
        },
        {
          filename: '/repo/packages/effect/src/server/index.ts',
          code: "import { startSpan } from '@sentry/core';",
        },
        // `effect`'s shared tracer implementation takes `startInactiveSpan` as an argument, so it is
        // not itself browser-facing - only `src/client/tracer.ts` binds the guarded variant.
        {
          filename: '/repo/packages/effect/src/tracer.ts',
          code: "import { startInactiveSpan } from '@sentry/core';",
        },
        // Tests and build config in browser packages don't ship to the browser.
        {
          filename: '/repo/packages/browser/test/tracing/request.test.ts',
          code: "import { startSpan } from '@sentry/core';",
        },
      ],
      invalid: [
        {
          filename: BROWSER_FILE,
          code: "import { startSpan } from '@sentry/core';",
          errors: [{ messageId: 'unguardedSpanApi' }],
        },
        {
          filename: BROWSER_FILE,
          code: "import { debug, startInactiveSpan, startSpanManual } from '@sentry/core';",
          errors: [{ messageId: 'unguardedSpanApi' }, { messageId: 'unguardedSpanApi' }],
        },
        {
          filename: BROWSER_FILE,
          code: "import { startIdleSpan } from '@sentry/core/server';",
          errors: [{ messageId: 'unguardedSpanApi' }],
        },
        // Only `src/client` of a meta-framework package is browser-facing...
        {
          filename: '/repo/packages/nextjs/src/client/routing.ts',
          code: "import { startSpan } from '@sentry/core';",
          errors: [{ messageId: 'unguardedSpanApi' }],
        },
        {
          filename: '/repo/packages/effect/src/client/tracer.ts',
          code: "import { startInactiveSpan } from '@sentry/core';",
          errors: [{ messageId: 'unguardedSpanApi' }],
        },
        // Ember ships from `addon`, not `src`.
        {
          filename: '/repo/packages/ember/addon/index.ts',
          code: "import { startSpan } from '@sentry/core';",
          errors: [{ messageId: 'unguardedSpanApi' }],
        },
      ],
    });
  });

  // `import type { startSpan }` and `import { type startSpan }` only ever feed signatures, never
  // start a span, so the rule must ignore them. RuleTester can't cover this: the repo has no working
  // TypeScript parser for ESLint (`@typescript-eslint/parser@5` can't run against `typescript@7`),
  // so we drive the visitor with the `ImportDeclaration` shape that parser would produce.
  describe('type-only imports are ignored', () => {
    function runOnImport(node: unknown): unknown[] {
      const reports: unknown[] = [];
      const visitor = rule.create({
        getFilename: () => BROWSER_FILE,
        report: (descriptor: unknown) => reports.push(descriptor),
      });
      visitor.ImportDeclaration?.(node);
      return reports;
    }

    const specifier = (name: string, importKind: string | undefined) => ({
      type: 'ImportSpecifier',
      importKind,
      imported: { name },
    });

    test('ignores `import type { startSpan }`', () => {
      expect(
        runOnImport({
          importKind: 'type',
          source: { value: '@sentry/core' },
          specifiers: [specifier('startSpan', 'value')],
        }),
      ).toEqual([]);
    });

    test('ignores an inline `type` specifier but still reports its siblings', () => {
      expect(
        runOnImport({
          importKind: 'value',
          source: { value: '@sentry/core' },
          specifiers: [specifier('startIdleSpan', 'type'), specifier('startSpan', 'value')],
        }),
      ).toEqual([expect.objectContaining({ data: { name: 'startSpan', source: '@sentry/core' } })]);
    });
  });
});
