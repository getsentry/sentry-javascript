type SentryInstrumented<T> = T & {
  __SENTRY_INSTRUMENTED__?: boolean;
};

/**
 * Mark an object as instrumented.
 */
export function markAsInstrumented<T>(obj: T): void {
  try {
    (obj as SentryInstrumented<T>).__SENTRY_INSTRUMENTED__ = true;
  } catch {
    // ignore errors here
  }
}

/**
 * Check if an object is instrumented.
 */
export function isInstrumented<T>(obj: T): boolean | undefined {
  try {
    return (obj as SentryInstrumented<T>).__SENTRY_INSTRUMENTED__;
  } catch {
    return false;
  }
}
