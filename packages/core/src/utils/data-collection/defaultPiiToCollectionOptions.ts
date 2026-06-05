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
        queryParams: true,
        genAI: { inputs: true, outputs: true },
        stackFrameVariables: true,
        frameContextLines: 5,
      }
    : {
        userInfo: false,
        cookies: { deny: PII_HEADER_SNIPPETS },
        httpHeaders: { request: { deny: PII_HEADER_SNIPPETS }, response: { deny: PII_HEADER_SNIPPETS } },
        httpBodies: [],
        queryParams: { deny: PII_HEADER_SNIPPETS },
        genAI: { inputs: false, outputs: false },
        stackFrameVariables: true,
        frameContextLines: 5,
      };
}
