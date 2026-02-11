export const INSTRUMENTATION_NAME = '@sentry/instrumentation-http';

/** We only want to capture request bodies up to 1mb. */
export const MAX_BODY_BYTE_LENGTH = 1024 * 1024;
