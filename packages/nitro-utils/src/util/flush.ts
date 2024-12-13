import { GLOBAL_OBJ, flush, getClient, logger, vercelWaitUntil } from '@sentry/core';

/**
 * Flushes Sentry for serverless environments.
 */
export async function flushIfServerless(): Promise<void> {
  const isServerless = !!process.env.LAMBDA_TASK_ROOT || !!process.env.VERCEL || !!process.env.NETLIFY;

  // @ts-expect-error - this is not typed
  if (GLOBAL_OBJ[Symbol.for('@vercel/request-context')]) {
    vercelWaitUntil(flushWithTimeout());
  } else if (isServerless) {
    await flushWithTimeout();
  }
}

/**
 * Flushes Sentry.
 */
export async function flushWithTimeout(): Promise<void> {
  const isDebug = getClient()?.getOptions()?.debug;

  try {
    isDebug && logger.log('Flushing events...');
    await flush(2000);
    isDebug && logger.log('Done flushing events');
  } catch (e) {
    isDebug && logger.log('Error while flushing events:\n', e);
  }
}
