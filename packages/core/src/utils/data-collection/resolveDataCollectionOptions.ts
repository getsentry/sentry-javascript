import type {
  CollectBehavior,
  DataCollection,
  HttpHeadersCollection,
  ResolvedDataCollection,
} from '../../types/datacollection';
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
 * 1. Fields explicitly set in `dataCollection`
 * 2. If `sendDefaultPii` is set and `dataCollection` is absent, bridge via `defaultPiiToCollectionOptions`
 * 3. Spec defaults
 *
 * TODO(v11): Remove `sendDefaultPii` support and always fall through to DEFAULTS so that `userInfo: true`
 * NOTE: In v10, DEFAULTS only apply when `dataCollection` is explicitly provided.
 * When `dataCollection` is absent, the legacy `sendDefaultPii` bridge is used, which defaults to
 * `userInfo: false` to preserve backward compatibility.
 */
export function resolveDataCollectionOptions(options: {
  dataCollection?: DataCollection;
  sendDefaultPii?: boolean;
}): ResolvedDataCollection {
  // TODO(v11): Remove the sendDefaultPii bridge and always use DEFAULTS.
  const base = options.dataCollection != null ? DEFAULTS : defaultPiiToCollectionOptions(options.sendDefaultPii);

  const dc = options.dataCollection ?? {};

  return {
    userInfo: dc.userInfo ?? base.userInfo,
    cookies: dc.cookies ?? base.cookies,
    httpHeaders: resolveHttpHeaders(dc.httpHeaders, base),
    httpBodies: dc.httpBodies ?? base.httpBodies,
    // oxlint-disable-next-line typescript/no-deprecated
    urlQueryParams: dc.urlQueryParams ?? dc.queryParams ?? base.urlQueryParams,
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
