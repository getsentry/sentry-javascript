import { flush } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import { logger } from './logger';

/**
 * Flushes pending Sentry events with a default 2-second timeout and in a way that cannot create unhandled promise rejections.
 */
export async function flushSafelyWithTimeout(timeout = 2000): Promise<void> {
  try {
    DEBUG_BUILD && logger.log('Flushing events...');
    await flush(timeout);
    DEBUG_BUILD && logger.log('Done flushing events');
  } catch (e) {
    DEBUG_BUILD && logger.log('Error while flushing events:\n', e);
  }
}
