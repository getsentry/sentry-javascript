import type { DataCollection, ResolvedDataCollection } from '../../types/datacollection';
import { defaultPiiToCollectionOptions } from './defaultPiiToCollectionOptions';

const DEFAULTS: ResolvedDataCollection = {
  userInfo: true,
  cookies: true,
  httpHeaders: { request: true, response: true },
  httpBodies: [],
  queryParams: true,
  genAI: { inputs: true, outputs: true },
  stackFrameVariables: true,
  frameContextLines: 5,
};

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
    httpHeaders: {
      request: dc.httpHeaders?.request ?? base.httpHeaders.request,
      response: dc.httpHeaders?.response ?? base.httpHeaders.response,
    },
    httpBodies: dc.httpBodies ?? base.httpBodies,
    queryParams: dc.queryParams ?? base.queryParams,
    genAI: {
      inputs: dc.genAI?.inputs ?? base.genAI.inputs,
      outputs: dc.genAI?.outputs ?? base.genAI.outputs,
    },
    stackFrameVariables: dc.stackFrameVariables ?? base.stackFrameVariables,
    frameContextLines: dc.frameContextLines ?? base.frameContextLines,
  };
}
