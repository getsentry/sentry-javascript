import type { Event, EventHint } from '../types/event';

export function isInternalException(hint: EventHint): boolean {
  return (hint.data as { __sentry__: boolean })?.__sentry__ === true;
}

/**
 * Get a list of possible event messages from a Sentry event.
 */
export function getPossibleEventMessages(event: Event): string[] {
  const possibleMessages: string[] = [];

  if (event.message) {
    possibleMessages.push(event.message);
  }

  try {
    // @ts-expect-error Try catching to save bundle size
    const lastException = event.exception.values[event.exception.values.length - 1];
    if (lastException?.value) {
      possibleMessages.push(lastException.value);
      if (lastException.type) {
        possibleMessages.push(`${lastException.type}: ${lastException.value}`);
      }
    }
  } catch {
    // ignore errors here
  }

  return possibleMessages;
}
