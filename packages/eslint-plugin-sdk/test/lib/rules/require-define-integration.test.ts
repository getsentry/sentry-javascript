import { RuleTester } from 'eslint';
import { describe, test } from 'vitest';
// @ts-expect-error untyped module
import rule from '../../../src/rules/require-define-integration';

const errors = [{ messageId: 'requireDefineIntegration', type: 'ObjectExpression' }];

describe('require-define-integration', () => {
  test('ruleTester', () => {
    const ruleTester = new RuleTester({
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    });

    ruleTester.run('require-define-integration', rule, {
      valid: [
        {
          code: "export const fooIntegration = defineIntegration(() => ({ name: 'Foo', setup() {} }));",
        },
        {
          code: "export const fooIntegration = core.defineIntegration(() => ({ name: 'Foo', setup() {} }));",
        },
        {
          code: `
            const _fooIntegration = () => {
              return { name: 'Foo', setupOnce() {} };
            };
            export const fooIntegration = defineIntegration(_fooIntegration);
          `,
        },
        // The object is built by a helper of the function that is passed to `defineIntegration`.
        {
          code: `
            function buildFoo(options) {
              return { name: 'Foo', processEvent: event => event };
            }
            const _fooIntegration = options => buildFoo(options);
            export const fooIntegration = defineIntegration(_fooIntegration);
          `,
        },
        {
          code: `
            function buildFoo(options) {
              return { name: 'Foo', setup() {} };
            }
            export const fooIntegration = defineIntegration(options => buildFoo(options));
          `,
        },
        // A factory that wraps the integration itself.
        {
          code: `
            export function createFooIntegration(name) {
              return defineIntegration(() => ({ name, setup() {} }));
            }
          `,
        },
        // No hook, so not an integration.
        {
          code: "export const foo = () => ({ name: 'Foo', handler() {} });",
        },
        // No name, so not an integration.
        {
          code: 'export const foo = () => ({ setup() {} });',
        },
        // Bundler plugins share the `{ name, setup }` shape.
        {
          filename: '/repo/packages/bundler-plugins/src/esbuild/index.ts',
          code: "export const plugin = () => ({ name: 'sentry-esbuild-plugin', setup(build) {} });",
        },
      ],
      invalid: [
        {
          code: "export const fooIntegration = () => ({ name: 'Foo', setup() {} });",
          errors,
        },
        {
          code: `
            export function fooIntegration() {
              return { name: 'Foo', setupOnce() {} };
            }
          `,
          errors,
        },
        // The function is never passed to `defineIntegration`.
        {
          code: `
            const _fooIntegration = () => {
              return { name: 'Foo', processSpan() {} };
            };
            export const fooIntegration = _fooIntegration;
          `,
          errors,
        },
        // `defineIntegration` wraps another integration of the file, not this one.
        {
          code: `
            const _fooIntegration = () => ({ name: 'Foo', setup() {} });
            const _barIntegration = () => ({ name: 'Bar', setup() {} });
            export const fooIntegration = defineIntegration(_fooIntegration);
            export const barIntegration = _barIntegration;
          `,
          errors,
        },
        {
          filename: '/repo/packages/node/src/integrations/foo.ts',
          code: "export const fooIntegration = () => ({ name: 'Foo', afterAllSetup() {} });",
          errors,
        },
      ],
    });
  });
});
