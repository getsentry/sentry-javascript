import { RuleTester } from 'eslint';
import { describe, test } from 'vitest';
// @ts-expect-error untyped module
import rule from '../../../src/rules/no-unsandboxed-console';

describe('no-unsandboxed-console', () => {
  test('ruleTester', () => {
    const ruleTester = new RuleTester({
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    });

    ruleTester.run('no-unsandboxed-console', rule, {
      valid: [
        {
          code: "consoleSandbox(() => console.warn('[Sentry] warning'));",
        },
        {
          code: "consoleSandbox(() => { console.warn('[Sentry] warning'); console.error(error); });",
        },
        {
          code: "consoleSandbox(function () { console.log('[Sentry] message'); });",
        },
        {
          code: "utils.consoleSandbox(() => { console.info('[Sentry] message'); });",
        },
        // The callback runs synchronously, so anything it calls synchronously is sandboxed too.
        {
          code: 'consoleSandbox(() => { messages.forEach(message => console.warn(message)); });',
        },
        {
          code: 'const result = consoleSandbox(() => console.table(rows));',
        },
        // Not the global console.
        {
          code: 'function sandbox() { const console = GLOBAL_OBJ.console; console.warn = original; }',
        },
        {
          code: 'function log(console) { console.log("x"); }',
        },
        {
          code: "GLOBAL_OBJ.console.warn('[Sentry] warning');",
        },
        {
          code: "debug.warn('[Sentry] warning');",
        },
      ],
      invalid: [
        {
          code: "console.warn('[Sentry] warning');",
          errors: [{ messageId: 'unsandboxedConsole', data: { method: 'warn' } }],
        },
        {
          code: "if (DEBUG_BUILD) { console.log('[Sentry] message'); }",
          errors: [{ messageId: 'unsandboxedConsole', data: { method: 'log' } }],
        },
        {
          code: 'console[level](message);',
          errors: [{ messageId: 'unsandboxedConsole', data: { method: '*' } }],
        },
        {
          code: 'const warn = console.warn;',
          errors: [{ messageId: 'unsandboxedConsole' }],
        },
        // Only the callback is sandboxed, not the arguments or other code around the call.
        {
          code: "consoleSandbox(() => {}); console.warn('[Sentry] warning');",
          errors: [{ messageId: 'unsandboxedConsole' }],
        },
        {
          code: 'consoleSandbox(console.warn.bind(console, message));',
          errors: [{ messageId: 'unsandboxedConsole' }],
        },
        {
          code: "otherWrapper(() => { console.warn('[Sentry] warning'); });",
          errors: [{ messageId: 'unsandboxedConsole' }],
        },
        {
          code: "consoleSandbox(() => {}, () => { console.warn('[Sentry] warning'); });",
          errors: [{ messageId: 'unsandboxedConsole' }],
        },
      ],
    });
  });
});
