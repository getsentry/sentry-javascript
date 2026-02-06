import { captureException } from '../../exports';
import { addExceptionMechanism } from '../../utils/misc';

/**
 * Captures an error with Supabase-specific mechanism and context.
 */
export function captureSupabaseError(error: unknown, mechanismType: string, context?: Record<string, unknown>): void {
  captureException(error, scope => {
    scope.addEventProcessor(e => {
      addExceptionMechanism(e, {
        handled: false,
        type: mechanismType,
      });
      return e;
    });
    if (context) {
      scope.setContext('supabase', context);
    }
    return scope;
  });
}
