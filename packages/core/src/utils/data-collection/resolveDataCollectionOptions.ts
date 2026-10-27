import type {
  CollectBehavior,
  DataCollection,
  HttpHeadersCollection,
  ResolvedDataCollection,
} from '../../types/datacollection';

const DEFAULTS: ResolvedDataCollection = {
  userInfo: true,
  cookies: true,
  httpHeaders: { request: true, response: true },
  httpBodies: ['incomingRequest', 'outgoingRequest', 'incomingResponse', 'outgoingResponse'],
  urlQueryParams: true,
  graphQL: { document: true, variables: true },
  genAI: { inputs: true, outputs: true },
  mcp: { inputs: true, outputs: true },
  databaseQueryData: true,
  queues: true,
  stackFrameVariables: true,
  frameContextLines: 5,
};

const OFF: ResolvedDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: false, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  frameContextLines: 0,
};

function isCollectBehavior(value: CollectBehavior | HttpHeadersCollection): value is CollectBehavior {
  return typeof value === 'boolean' || 'allow' in value || 'deny' in value;
}

function resolveHttpHeaders(
  httpHeaders: DataCollection['httpHeaders'],
  base: ResolvedDataCollection,
): ResolvedDataCollection['httpHeaders'] {
  if (httpHeaders === undefined) {
    return { ...base.httpHeaders };
  }

  if (isCollectBehavior(httpHeaders)) {
    return { request: httpHeaders, response: httpHeaders };
  }

  return {
    request: httpHeaders.request ?? base.httpHeaders.request,
    response: httpHeaders.response ?? base.httpHeaders.response,
  };
}

/**
 * Resolves the effective `DataCollection` configuration from client options.
 *
 * Precedence:
 * 1. Spec defaults, or all collection turned off when `dataCollection.unlisted` is `'off'`
 * 2. Fields explicitly set in `dataCollection`
 */
export function resolveDataCollectionOptions(options: { dataCollection?: DataCollection }): ResolvedDataCollection {
  const dc = options.dataCollection ?? {};
  const base = dc.unlisted === 'off' ? OFF : DEFAULTS;

  return {
    userInfo: dc.userInfo ?? base.userInfo,
    cookies: dc.cookies ?? base.cookies,
    httpHeaders: resolveHttpHeaders(dc.httpHeaders, base),
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
    mcp: {
      inputs: dc.mcp?.inputs ?? base.mcp.inputs,
      outputs: dc.mcp?.outputs ?? base.mcp.outputs,
    },
    databaseQueryData: dc.databaseQueryData ?? base.databaseQueryData,
    queues: dc.queues ?? base.queues,
    stackFrameVariables: dc.stackFrameVariables ?? base.stackFrameVariables,
    frameContextLines: dc.frameContextLines ?? base.frameContextLines,
  };
}
