import type { DataCollection, ResolvedDataCollection } from '../../types/datacollection';
import { defaultPiiToCollectionOptions } from './defaultPiiToCollectionOptions';

const DEFAULTS: ResolvedDataCollection = {
  userInfo: true,
  cookies: true,
  httpHeaders: { request: true, response: true },
  httpBodies: ['incomingRequest', 'outgoingRequest', 'incomingResponse', 'outgoingResponse'],
  urlQueryParams: true,
  graphQL: { document: true, variables: true },
  genAI: { inputs: true, outputs: true },
  databaseQueryData: true,
  stackFrameVariables: true,
  frameContextLines: 5,
};

/**
 * Resolves the effective `DataCollection` configuration from client options.
 *
 * Precedence:
 * 1. Spec defaults
 * 2. Fields explicitly set in `dataCollection`
 * 3. If `sendDefaultPii` is set and `dataCollection` is absent, bridge via `defaultPiiToCollectionOptions`
 *
 * TODO(v11): Remove `sendDefaultPii` support and always use DEFAULTS.
 */
export function resolveDataCollectionOptions(options: {
  dataCollection?: DataCollection;
  sendDefaultPii?: boolean;
}): ResolvedDataCollection {
  const base =
    options.dataCollection == null && options.sendDefaultPii != null
      ? defaultPiiToCollectionOptions(options.sendDefaultPii)
      : DEFAULTS;

  const dc = options.dataCollection ?? {};

  return {
    userInfo: dc.userInfo ?? base.userInfo,
    cookies: dc.cookies ?? base.cookies,
    httpHeaders: {
      request: dc.httpHeaders?.request ?? base.httpHeaders.request,
      response: dc.httpHeaders?.response ?? base.httpHeaders.response,
    },
    httpBodies: dc.httpBodies ?? base.httpBodies,
    urlQueryParams: dc.urlQueryParams ?? base.urlQueryParams,
    graphQL: {
      document: dc.graphQL?.document ?? base.graphQL.document,
      variables: dc.graphQL?.variables ?? base.graphQL.variables,
    },
    genAI: {
      inputs: dc.genAI?.inputs ?? base.genAI.inputs,
      outputs: dc.genAI?.outputs ?? base.genAI.outputs,
    },
    databaseQueryData: dc.databaseQueryData ?? base.databaseQueryData,
    stackFrameVariables: dc.stackFrameVariables ?? base.stackFrameVariables,
    frameContextLines: dc.frameContextLines ?? base.frameContextLines,
  };
}
