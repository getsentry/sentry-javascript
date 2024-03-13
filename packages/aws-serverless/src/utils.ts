import type { Scope } from '@sentry/types';
import { addExceptionMechanism } from '@sentry/utils';

/**
 * Marks an event as unhandled by adding a span processor to the passed scope.
 */
export function markEventUnhandled(scope: Scope): Scope {
  scope.addEventProcessor(event => {
    addExceptionMechanism(event, { handled: false });
    return event;
  });

  return scope;
}
