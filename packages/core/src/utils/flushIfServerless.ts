import { flush } from '../exports';
import { debug } from './debug-logger';
import { vercelWaitUntil } from './vercelWaitUntil';
import { GLOBAL_OBJ } from './worldwide';

type MinimalCloudflareContext = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  waitUntil(promise: Promise<any>): void;
};

async function flushWithTimeout(timeout: number): Promise<void> {
  try {
    debug.log('Flushing events...');
    await flush(timeout);
    debug.log('Done flushing events');
  } catch (e) {
    debug.log('Error while flushing events:\n', e);
  }
}

/**
 *  Flushes the event queue with a timeout in serverless environments to ensure that events are sent to Sentry before the
 *  serverless function execution ends.
 *
 * The function is async, but in environments that support a `waitUntil` mechanism, it will run synchronously.
 *
 * This function is aware of the following serverless platforms:
 * - Cloudflare: If a Cloudflare context is provided, it will use `ctx.waitUntil()` to flush events.
 * - Vercel: It detects the Vercel environment and uses Vercel's `waitUntil` function.
 * - Other Serverless (AWS Lambda, Google Cloud, etc.): It detects the environment via environment variables
 *   and uses a regular `await flush()`.
 *
 *  @internal This function is supposed for internal Sentry SDK usage only.
 *  @hidden
 */
export async function flushIfServerless(
  params: {
    timeout?: number;
    cloudflareCtx?: MinimalCloudflareContext;
  } = {},
): Promise<void> {
  const { timeout = 2000, cloudflareCtx } = params;

  if (cloudflareCtx && typeof cloudflareCtx.waitUntil === 'function') {
    cloudflareCtx.waitUntil(flushWithTimeout(timeout));
    return;
  }

  // @ts-expect-error This is not typed
  if (GLOBAL_OBJ[Symbol.for('@vercel/request-context')]) {
    // Vercel has a waitUntil equivalent that works without execution context
    vercelWaitUntil(flushWithTimeout(timeout));
    return;
  }

  if (typeof process === 'undefined') {
    return;
  }

  const isServerless =
    !!process.env.FUNCTIONS_WORKER_RUNTIME || // Azure Functions
    !!process.env.LAMBDA_TASK_ROOT || // AWS Lambda
    !!process.env.K_SERVICE || // Google Cloud Run
    !!process.env.CF_PAGES || // Cloudflare Pages
    !!process.env.VERCEL ||
    !!process.env.NETLIFY;

  if (isServerless) {
    // Use regular flush for environments without a generic waitUntil mechanism
    await flushWithTimeout(timeout);
  }
}
