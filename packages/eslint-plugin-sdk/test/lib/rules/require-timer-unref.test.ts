import { RuleTester } from 'eslint';
import { describe, test } from 'vitest';
// @ts-expect-error untyped module
import rule from '../../../src/rules/require-timer-unref';

const CORE_FILE = '/repo/packages/core/src/utils/flush.ts';
const NODE_FILE = '/repo/packages/node/src/sdk/client.ts';

const error = { messageId: 'timerNotUnrefed' };

describe('require-timer-unref', () => {
  test('ruleTester', () => {
    const ruleTester = new RuleTester({
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    });

    ruleTester.run('require-timer-unref', rule, {
      valid: [
        // Passed straight to an unref helper.
        { filename: CORE_FILE, code: 'safeUnref(setTimeout(fn, 1));' },
        { filename: CORE_FILE, code: 'const timer = safeUnref(setInterval(fn, 1));' },
        { filename: CORE_FILE, code: 'const bucket = { timeout: safeUnref(setTimeout(fn, 1)) };' },
        { filename: NODE_FILE, code: 'intervalId = _INTERNAL_safeUnref(setInterval(fn, 1));' },
        {
          filename: NODE_FILE,
          code: "import { _INTERNAL_safeUnref as unref } from '@sentry/core/server'; unref(setTimeout(fn, 1));",
        },
        { filename: '/repo/packages/deno/src/client.ts', code: 'const id = setInterval(fn, 1); Deno.unrefTimer(id);' },
        // `.unref()` on the call result.
        { filename: NODE_FILE, code: 'setInterval(fn, 1).unref();' },
        { filename: NODE_FILE, code: 'global.setTimeout(fn, 1).unref();' },
        // `.unref()` or `safeUnref()` on the variable or property the timer is stored in.
        { filename: NODE_FILE, code: 'const timer = setInterval(fn, 1); timer.unref();' },
        { filename: NODE_FILE, code: 'const timer = setInterval(fn, 1); timer.unref?.();' },
        { filename: CORE_FILE, code: 'const timeout = setTimeout(fn, 1); safeUnref(timeout);' },
        { filename: NODE_FILE, code: 'chunk.timer = global.setTimeout(fn, 1); chunk.timer.unref();' },
        { filename: NODE_FILE, code: 'class A { start() { this._timer = setInterval(fn, 1); this._timer.unref(); } }' },
        { filename: NODE_FILE, code: 'let timer; timer = setTimeout(fn, 1); timer.unref();' },
        // Server parts of mixed packages are in scope, their client parts are not.
        { filename: '/repo/packages/nextjs/src/client/index.ts', code: 'setTimeout(fn, 1);' },
        { filename: '/repo/packages/nuxt/src/runtime/plugins/sentry.client.ts', code: 'setTimeout(fn, 1);' },
        // Browser-only packages, and runtimes whose timers can't be unref'd.
        { filename: '/repo/packages/browser/src/sdk.ts', code: 'setTimeout(fn, 1);' },
        { filename: '/repo/packages/cloudflare/src/client.ts', code: 'setTimeout(fn, 1);' },
        { filename: '/repo/packages/vercel-edge/src/transports/index.ts', code: 'setTimeout(fn, 1);' },
        // Tests don't ship.
        { filename: '/repo/packages/core/test/lib/client.test.ts', code: 'setTimeout(fn, 1);' },
        // Other timer-like APIs.
        { filename: CORE_FILE, code: 'setImmediate(fn); queueMicrotask(fn); clearTimeout(timer);' },
      ],
      invalid: [
        { filename: CORE_FILE, code: 'setTimeout(fn, 1);', errors: [error] },
        { filename: CORE_FILE, code: 'setInterval(fn, 1);', errors: [error] },
        { filename: NODE_FILE, code: 'global.setTimeout(fn, 1);', errors: [error] },
        { filename: NODE_FILE, code: 'globalThis.setInterval(fn, 1);', errors: [error] },
        { filename: CORE_FILE, code: 'await new Promise(resolve => setTimeout(resolve, 1));', errors: [error] },
        { filename: CORE_FILE, code: 'function f() { return setTimeout(fn, 1); }', errors: [error] },
        { filename: '/repo/packages/nextjs/src/server/index.ts', code: 'setTimeout(fn, 1);', errors: [error] },
        { filename: '/repo/packages/bundler-plugins/src/webpack/index.ts', code: 'setTimeout(fn);', errors: [error] },
        // Clearing a timer does not stop it from keeping the process alive until then.
        { filename: CORE_FILE, code: 'const timer = setTimeout(fn, 1); clearTimeout(timer);', errors: [error] },
        // Unref'ing a different timer does not count.
        {
          filename: NODE_FILE,
          code: 'const a = setTimeout(fn, 1); const b = setTimeout(fn, 1); b.unref();',
          errors: [error],
        },
        { filename: NODE_FILE, code: 'this._a = setTimeout(fn, 1); this._b.unref();', errors: [error] },
        // The timer has to be the helper's argument, not something it is called with.
        { filename: CORE_FILE, code: 'safeUnref(timer, setTimeout(fn, 1));', errors: [error] },
        { filename: CORE_FILE, code: 'unrelated(setTimeout(fn, 1));', errors: [error] },
      ],
    });
  });
});
