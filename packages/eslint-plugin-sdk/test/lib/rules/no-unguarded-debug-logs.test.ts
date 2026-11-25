import { RuleTester } from 'eslint';
import { describe, test } from 'vitest';
// @ts-expect-error untyped module
import rule from '../../../src/rules/no-unguarded-debug-logs';

const CORE_FILE = '/repo/packages/core/src/utils/dsn.ts';
const BROWSER_FILE = '/repo/packages/browser/src/integrations/spotlight.ts';

const error = { messageId: 'unguardedDebugLog' };

describe('no-unguarded-debug-logs', () => {
  test('ruleTester', () => {
    const ruleTester = new RuleTester({
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    });

    ruleTester.run('no-unguarded-debug-logs', rule, {
      valid: [
        { filename: CORE_FILE, code: "DEBUG_BUILD && debug.log('a');" },
        { filename: CORE_FILE, code: "DEBUG_BUILD && debug.warn('a');" },
        { filename: CORE_FILE, code: "DEBUG_BUILD && debug.error('a');" },
        // Extra conditions on either side of the gate.
        { filename: CORE_FILE, code: "DEBUG_BUILD && enabled && debug.log('a');" },
        { filename: CORE_FILE, code: "enabled && DEBUG_BUILD && debug.log('a');" },
        { filename: CORE_FILE, code: "DEBUG_BUILD && (debug.log('a'), debug.warn('b'));" },
        // `if` and ternary gates are removed by minifiers just like `&&`.
        { filename: CORE_FILE, code: "if (DEBUG_BUILD) { debug.log('a'); debug.warn('b'); }" },
        { filename: CORE_FILE, code: "if (DEBUG_BUILD && enabled) debug.log('a');" },
        { filename: CORE_FILE, code: "DEBUG_BUILD ? debug.log('a') : undefined;" },
        // A gate on an enclosing scope covers nested callbacks.
        { filename: CORE_FILE, code: "if (DEBUG_BUILD) { list.forEach(item => debug.log('a', item)); }" },
        // Early exit at the top of a function.
        { filename: CORE_FILE, code: "function f() { if (!DEBUG_BUILD) return; debug.log('a'); }" },
        { filename: CORE_FILE, code: "function f() { if (!DEBUG_BUILD) { return true; } debug.log('a'); }" },
        // Other packages' gate names.
        { filename: '/repo/packages/angular/src/sdk.ts', code: "IS_DEBUG_BUILD && debug.warn('a');" },
        { filename: CORE_FILE, code: "__DEBUG_BUILD__ && debug.warn('a');" },
        // Only the logging methods carry message strings.
        { filename: CORE_FILE, code: 'debug.enable();' },
        { filename: CORE_FILE, code: 'promise.catch(debug.error);' },
        // Server, edge and build-time code keeps its logs.
        { filename: '/repo/packages/node/src/sdk/index.ts', code: "debug.log('a');" },
        { filename: '/repo/packages/nextjs/src/server/index.ts', code: "debug.log('a');" },
        // Tests don't ship.
        { filename: '/repo/packages/core/test/lib/dsn.test.ts', code: "debug.log('a');" },
        { filename: '/repo/packages/browser/test/index.test.ts', code: "debug.log('a');" },
      ],
      invalid: [
        { filename: CORE_FILE, code: "debug.log('a');", errors: [error] },
        { filename: CORE_FILE, code: "debug.warn('a');", errors: [error] },
        { filename: BROWSER_FILE, code: "debug.error('a');", errors: [error] },
        { filename: '/repo/packages/nextjs/src/client/index.ts', code: "debug.log('a');", errors: [error] },
        { filename: '/repo/packages/ember/addon/index.ts', code: "debug.log('a');", errors: [error] },
        // Only `&&` gates. `||` runs the call when the gate is off.
        { filename: CORE_FILE, code: "DEBUG_BUILD || debug.log('a');", errors: [error] },
        { filename: CORE_FILE, code: "(DEBUG_BUILD || enabled) && debug.log('a');", errors: [error] },
        // The `else` branch and the left-hand side are not gated.
        { filename: CORE_FILE, code: "if (DEBUG_BUILD) {} else { debug.log('a'); }", errors: [error] },
        { filename: CORE_FILE, code: "DEBUG_BUILD ? undefined : debug.log('a');", errors: [error] },
        { filename: CORE_FILE, code: "debug.log('a') && DEBUG_BUILD;", errors: [error] },
        { filename: CORE_FILE, code: "if (!DEBUG_BUILD) { debug.log('a'); }", errors: [error] },
        // A negated gate only covers what comes after the early exit.
        {
          filename: CORE_FILE,
          code: "function f() { debug.log('a'); if (!DEBUG_BUILD) return; }",
          errors: [error],
        },
        {
          filename: CORE_FILE,
          code: "function f() { if (!DEBUG_BUILD) { cleanup(); } debug.log('a'); }",
          errors: [error],
        },
        // An unrelated gate isn't enough.
        { filename: CORE_FILE, code: "enabled && debug.log('a');", errors: [error] },
        // Aliased imports of `debug`.
        {
          filename: BROWSER_FILE,
          code: "import { debug as coreDebug } from '@sentry/core'; coreDebug.log('a');",
          errors: [error],
        },
      ],
    });
  });
});
