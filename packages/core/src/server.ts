/**
 * Server-only utilities for Sentry SDKs.
 *
 * @module
 */

export type { ServerRuntimeClientOptions } from './server-runtime-client';
export { ServerRuntimeClient } from './server-runtime-client';
export type { TunnelRequestLike } from './utils/tunnel';
export {
  getServedTunnel as _INTERNAL_getServedTunnel,
  getTunnelPaths as _INTERNAL_getTunnelPaths,
  handleServedTunnelRequest as _INTERNAL_handleServedTunnelRequest,
  isServedTunnelRequest as _INTERNAL_isServedTunnelRequest,
  isTunnelRequest,
} from './utils/tunnel';
export {
  httpServerHandlesTunnel as _INTERNAL_httpServerHandlesTunnel,
  setNodeTunnelHandler as _INTERNAL_setNodeTunnelHandler,
} from './utils/tunnelStore';
export {
  forwardTunnelRequest as _INTERNAL_forwardTunnelRequest,
  handleServedNodeTunnelRequest as _INTERNAL_handleServedNodeTunnelRequest,
  pickForwardedHeaders as _INTERNAL_pickForwardedHeaders,
  handleTunnelRequestIfMatched,
} from './utils/tunnelForward';
export { serveTunnelIntegration } from './integrations/serveTunnel';
export {
  _INTERNAL_resetTunnelDefaults,
  setTunnelDefaults as _INTERNAL_setTunnelDefaults,
} from './utils/tunnelDefaults';
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
export {
  flushIfServerless,
  setScopeFlushedByRuntime as _INTERNAL_setScopeFlushedByRuntime,
} from './utils/flushIfServerless';
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
export { HTTP_ON_CLIENT_REQUEST, HTTP_ON_SERVER_REQUEST, HTTP2_ON_SERVER_STREAM } from './integrations/http/constants';
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
