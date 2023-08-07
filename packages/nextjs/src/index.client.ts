export * from './common';
export * from './client';

// This file is the main entrypoint for non-Next.js build pipelines that use
// the package.json's "browser" field or the Edge runtime (Edge API routes and middleware)

/**
 * This const serves no purpose besides being an identifier for this file that the SDK multiplexer loader can use to
 * determine that this is in fact a file that wants to be multiplexed.
 */
export const _SENTRY_SDK_MULTIPLEXER = true;
