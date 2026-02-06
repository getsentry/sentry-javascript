import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { SPAN_STATUS_ERROR, SPAN_STATUS_OK, startSpan } from '../../tracing';
import { AUTH_ADMIN_OPERATIONS_TO_INSTRUMENT, AUTH_OPERATIONS_TO_INSTRUMENT } from './constants';
import { captureSupabaseError } from './errors';
import type { AuthOperationFn, SupabaseClientInstance } from './types';
import { _isInstrumented, _markAsInstrumented } from './utils';

/**
 * Instruments Supabase auth operations.
 *
 * Creates auto.db.supabase spans for auth operations (signIn, signUp, etc.)
 * to track authentication performance and errors.
 */
function _instrumentAuthOperation(operation: AuthOperationFn, isAdmin = false): AuthOperationFn {
  return new Proxy(operation, {
    apply(target, thisArg, argumentsList) {
      return startSpan(
        {
          name: `auth ${isAdmin ? '(admin) ' : ''}${operation.name}`,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.supabase',
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db',
            'db.system': 'postgresql',
            'db.operation': `auth.${isAdmin ? 'admin.' : ''}${operation.name}`,
          },
        },
        span => {
          return Reflect.apply(target, thisArg, argumentsList)
            .then((res: unknown) => {
              if (res && typeof res === 'object' && 'error' in res && res.error) {
                span.setStatus({ code: SPAN_STATUS_ERROR });
                captureSupabaseError(res.error, 'auto.db.supabase.auth');
              } else {
                span.setStatus({ code: SPAN_STATUS_OK });
              }

              // Return response to caller even on Supabase error (not exception)
              return res;
            })
            .catch((err: unknown) => {
              span.setStatus({ code: SPAN_STATUS_ERROR });
              captureSupabaseError(err, 'auto.db.supabase.auth');
              throw err;
            });
        },
      );
    },
  });
}

/**
 * Instruments all auth operations on a Supabase client instance.
 *
 * Iterates through AUTH_OPERATIONS_TO_INSTRUMENT and AUTH_ADMIN_OPERATIONS_TO_INSTRUMENT,
 * wrapping each operation with Sentry instrumentation. Handles both regular auth operations
 * (signIn, signUp, etc.) and admin operations (createUser, deleteUser, etc.).
 *
 * @param supabaseClientInstance - The Supabase client instance to instrument
 */
export function _instrumentSupabaseAuthClient(supabaseClientInstance: SupabaseClientInstance): void {
  const auth = supabaseClientInstance.auth;

  if (!auth || _isInstrumented(supabaseClientInstance.auth)) {
    return;
  }

  for (const operation of AUTH_OPERATIONS_TO_INSTRUMENT) {
    const authOperation = auth[operation];

    if (!authOperation) {
      continue;
    }

    if (typeof supabaseClientInstance.auth[operation] === 'function') {
      supabaseClientInstance.auth[operation] = _instrumentAuthOperation(authOperation);
    }
  }

  for (const operation of AUTH_ADMIN_OPERATIONS_TO_INSTRUMENT) {
    const authOperation = auth.admin[operation];

    if (!authOperation) {
      continue;
    }

    if (typeof supabaseClientInstance.auth.admin[operation] === 'function') {
      supabaseClientInstance.auth.admin[operation] = _instrumentAuthOperation(authOperation, true);
    }
  }

  _markAsInstrumented(supabaseClientInstance.auth);
}
