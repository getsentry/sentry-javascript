import { PII_HEADER_SNIPPETS } from './filtering-snippets';
import type { ResolvedDataCollection } from '../../types/datacollection';

/**
 * Helper function that maps the `sendDefaultPii` boolean flag to the corresponding `DataCollection` configuration.
 * Used as a backward-compatibility bridge when `dataCollection` is not set by the user.
 *
 * TODO(v11): Remove this function along with `sendDefaultPii`. Once `dataCollection` is the only API,
 * the DEFAULTS in `resolveDataCollectionOptions` (including `userInfo: true`) will always apply.
 */
export function defaultPiiToCollectionOptions(sendDefaultPii?: boolean): ResolvedDataCollection {
  return sendDefaultPii === true
    ? {
        userInfo: true,
        cookies: true,
        httpHeaders: { request: true, response: true },
        httpBodies: ['incomingRequest', 'outgoingRequest', 'incomingResponse', 'outgoingResponse'],
        urlQueryParams: true,
        graphQL: { document: true, variables: true },
        genAI: { inputs: true, outputs: true },
        databaseQueryData: true,
        stackFrameVariables: true,
        frameContextLines: 7, // default should be 5, but ContextLines integration uses 7
      }
    : {
        userInfo: false,
        cookies: { deny: PII_HEADER_SNIPPETS },
        httpHeaders: { request: { deny: PII_HEADER_SNIPPETS }, response: { deny: PII_HEADER_SNIPPETS } },
        httpBodies: [],
        urlQueryParams: { deny: PII_HEADER_SNIPPETS },
        // The GraphQL document has literal values redacted at collection time, so it was historically
        // always attached regardless of `sendDefaultPii`; keep it on to preserve that behavior.
        graphQL: { document: true, variables: true },
        genAI: { inputs: true, outputs: true },
        // Database query values were only sent with `sendDefaultPii: true` (e.g. Supabase gated on it),
        // so map the legacy "off" state to `false`.
        databaseQueryData: false,
        stackFrameVariables: true,
        frameContextLines: 7, // default should be 5, but ContextLines integration uses 7
      };
}
