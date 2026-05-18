import { PII_HEADER_SNIPPETS } from './filtering-snippets';
import type { DataCollection } from '../../types-hoist/datacollection';

/**
 * Helper function that maps the `sendDefaultPii` boolean flag to the corresponding `DataCollection` configuration.
 */
export function defaultPiiToCollectionOptions(sendDefaultPii?: boolean): DataCollection {
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
