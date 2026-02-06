// Based on Kamil Ogórek's work on:
// https://github.com/supabase-community/sentry-integration-js

// Re-export public types
import { DEBUG_BUILD } from '../../debug-build';
import { defineIntegration } from '../../integration';
import type { IntegrationFn } from '../../types-hoist/integration';
import { debug } from '../../utils/debug-logger';
import { _instrumentSupabaseAuthClient } from './auth';
import { INTEGRATION_NAME } from './constants';
import { _instrumentSupabaseClientConstructor } from './postgrest';
import { _instrumentRpc, _instrumentRpcReturnedFromSchemaCall } from './rpc';
import type { SupabaseClientInstance } from './types';

export type {
  SupabaseClientConstructorType,
  SupabaseClientInstance,
  PostgRESTQueryBuilder,
  PostgRESTFilterBuilder,
  SupabaseResponse,
  SupabaseError,
  SupabaseBreadcrumb,
  PostgRESTProtoThenable,
} from './types';

// Re-export public constants
export { FILTER_MAPPINGS, DB_OPERATIONS_TO_INSTRUMENT } from './constants';

// Re-export public utils
export { extractOperation, translateFiltersIntoMethods } from './utils';

/**
 * Instruments a Supabase client instance with Sentry tracing.
 *
 * This can be called directly if you need to instrument after initialization,
 * though typically using `supabaseIntegration` is preferred.
 *
 * @param supabaseClient - The Supabase client instance to instrument
 */
export const instrumentSupabaseClient = (supabaseClient: unknown): void => {
  if (!supabaseClient) {
    DEBUG_BUILD && debug.warn('Supabase integration was not installed because no Supabase client was provided.');
    return;
  }
  const SupabaseClientConstructor =
    supabaseClient.constructor === Function ? supabaseClient : supabaseClient.constructor;

  _instrumentSupabaseClientConstructor(SupabaseClientConstructor);
  _instrumentRpcReturnedFromSchemaCall(SupabaseClientConstructor);
  _instrumentRpc(SupabaseClientConstructor);
  _instrumentSupabaseAuthClient(supabaseClient as SupabaseClientInstance);
};

const _supabaseIntegration = ((options: { supabaseClient: unknown }) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentSupabaseClient(options.supabaseClient);
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [Supabase](https://supabase.com/) library.
 *
 * Instruments Supabase client operations including database queries, auth operations, and queue operations (via PGMQ).
 * Creates spans and breadcrumbs for all operations, with support for distributed tracing across queue producers and consumers.
 *
 * For more information, see the [`supabaseIntegration` documentation](https://docs.sentry.io/platforms/javascript/configuration/integrations/supabase/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/core');
 * const { createClient } = require('@supabase/supabase-js');
 *
 * const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
 *
 * Sentry.init({
 *   integrations: [Sentry.supabaseIntegration({ supabaseClient: supabase })],
 * });
 * ```
 */
export const supabaseIntegration = defineIntegration(_supabaseIntegration);
