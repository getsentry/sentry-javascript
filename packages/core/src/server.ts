/**
 * Server-only utilities for Sentry SDKs.
 *
 * @module
 */

export type { ServerRuntimeClientOptions } from './server-runtime-client';
export { ServerRuntimeClient } from './server-runtime-client';
export type { TunnelRequestLike } from './utils/tunnel';
export {
  getTunnelPaths as _INTERNAL_getTunnelPaths,
  handleServedTunnelRequest as _INTERNAL_handleServedTunnelRequest,
  isServedTunnelRequest as _INTERNAL_isServedTunnelRequest,
  isTunnelRequest,
} from './utils/tunnel';
export {
  forwardTunnelRequest as _INTERNAL_forwardTunnelRequest,
  handleServedNodeTunnelRequest as _INTERNAL_handleServedNodeTunnelRequest,
  handleTunnelRequestIfMatched,
} from './utils/tunnelForward';
export { instrumentTunnelServer as _INTERNAL_instrumentTunnelServer } from './utils/tunnelServer';
export { serveTunnelIntegration } from './integrations/serveTunnel';
export {
  _INTERNAL_resetManagedTunnelDefaults,
  setManagedTunnelDefaults as _INTERNAL_setManagedTunnelDefaults,
} from './utils/managedTunnelDefaults';
export type { ServerRuntimeOptions } from './types/options';
export { trpcMiddleware } from './trpc';
export { wrapMcpServerWithSentry } from './integrations/mcp-server';
export { isNodeEnv, loadModule } from './utils/node';
export { filenameIsInApp, node, nodeStackLineParser } from './utils/node-stack-trace';
export { vercelWaitUntil } from './utils/vercelWaitUntil';
export {
  getReleaseFromCommitEnv as _INTERNAL_getReleaseFromCommitEnv,
  readCommitEnvVar as _INTERNAL_readCommitEnvVar,
} from './utils/commitEnv';
export { flushIfServerless } from './utils/flushIfServerless';
export { callFrameToStackFrame, watchdogTimer } from './utils/anr';
export { safeUnref as _INTERNAL_safeUnref } from './utils/timer';
export { patchHttpModuleClient } from './integrations/http/client-patch';
export { getHttpClientSubscriptions } from './integrations/http/client-subscriptions';
export { getHttpServerSubscriptions, isStaticAssetRequest } from './integrations/http/server-subscription';
export {
  DEFAULT_IGNORE_STATUS_CODES,
  processHttpServerTransactionEvent,
} from './integrations/http/server-transaction-event';
export { recordRequestSession, startRequestSession } from './integrations/http/record-request-session';
export { getClientIPAddress } from './utils/clientIPAddress';
export { addOutgoingRequestBreadcrumb } from './integrations/http/add-outgoing-request-breadcrumb';
export {
  getRequestUrl,
  getRequestUrlObject,
  getRequestUrlFromClientRequest,
  getRequestOptions,
} from './integrations/http/get-request-url';
export { HTTP_ON_CLIENT_REQUEST, HTTP_ON_SERVER_REQUEST } from './integrations/http/constants';
export type {
  HttpInstrumentationOptions,
  HttpClientRequest,
  HttpIncomingMessage,
  HttpServerResponse,
  HttpModuleExport,
} from './integrations/http/types';
export type {
  AssertTrue,
  CheckServerRequestOptions,
  ServerRequestOptions,
} from './integrations/http/server-request-options';
export { createFetchIntegration } from './integrations/fetch';
export type { FetchIntegrationOptions } from './integrations/fetch';
export { classifyResponseStreaming } from './utils/responseStreaming';
export type { StreamingGuess } from './utils/responseStreaming';
