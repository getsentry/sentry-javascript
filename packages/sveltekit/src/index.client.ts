export * from './client';

/**
 * This const serves no purpose besides being an identifier for this file that the SDK multiplexer loader can use to
 * determine that this is in fact a file that wants to be multiplexed.
 */
export const _SENTRY_SDK_MULTIPLEXER = true;
