export const SENTRY_ERROR_NAME = 'SentryError';

type SentryError = Error & { name: typeof SENTRY_ERROR_NAME };

/**
 * Generates an SentryError that will be filtered during event
 * processing.
 */
export function createSentryError(message: string): SentryError {
  const error = new Error(message);
  error.name = SENTRY_ERROR_NAME;
  return error as SentryError;
}

/**
 * Validates if a variable is a SentryError
 * @param wat variable to check if it is a SentryError
 */
export function isSentryError(wat: unknown): wat is SentryError {
  return wat instanceof Error && wat.name === SENTRY_ERROR_NAME;
}
