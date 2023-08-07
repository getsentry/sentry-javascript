export * from './common';
export * from './config';
export * from './server';

// This file is the main entrypoint on the server and/or when the package is `require`d

/**
 * This const serves no purpose besides being an identifier for this file that the SDK multiplexer loader can use to
 * determine that this is in fact a file that wants to be multiplexed.
 */
export const _SENTRY_SDK_MULTIPLEXER = true;
