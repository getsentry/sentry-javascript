import type { DataCollection, ResolvedDataCollection } from '../../types/datacollection';

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
 */
export function resolveDataCollectionOptions(options: { dataCollection?: DataCollection }): ResolvedDataCollection {
  const dc = options.dataCollection ?? {};

  return {
    userInfo: dc.userInfo ?? DEFAULTS.userInfo,
    cookies: dc.cookies ?? DEFAULTS.cookies,
    httpHeaders: {
      request: dc.httpHeaders?.request ?? DEFAULTS.httpHeaders.request,
      response: dc.httpHeaders?.response ?? DEFAULTS.httpHeaders.response,
    },
    httpBodies: dc.httpBodies ?? DEFAULTS.httpBodies,
    urlQueryParams: dc.urlQueryParams ?? DEFAULTS.urlQueryParams,
    graphQL: {
      document: dc.graphQL?.document ?? DEFAULTS.graphQL.document,
      variables: dc.graphQL?.variables ?? DEFAULTS.graphQL.variables,
    },
    genAI: {
      inputs: dc.genAI?.inputs ?? DEFAULTS.genAI.inputs,
      outputs: dc.genAI?.outputs ?? DEFAULTS.genAI.outputs,
    },
    databaseQueryData: dc.databaseQueryData ?? DEFAULTS.databaseQueryData,
    stackFrameVariables: dc.stackFrameVariables ?? DEFAULTS.stackFrameVariables,
    frameContextLines: dc.frameContextLines ?? DEFAULTS.frameContextLines,
  };
}
