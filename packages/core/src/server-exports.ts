/**
 * Server-only utilities for Sentry SDKs.
 *
 * @module
 */

export { startSpan, startInactiveSpan, startSpanManual } from './tracing/trace';
export { spanStreamingIntegration } from './integrations/spanStreaming';

export type { ServerRuntimeClientOptions } from './server-runtime-client';
export { ServerRuntimeClient } from './server-runtime-client';
export type { ServerRuntimeOptions } from './types/options';
export { trpcMiddleware } from './trpc';
export { wrapMcpServerWithSentry } from './integrations/mcp-server';
export { isNodeEnv, loadModule } from './utils/node';
export { filenameIsInApp, node, nodeStackLineParser } from './utils/node-stack-trace';
export { vercelWaitUntil } from './utils/vercelWaitUntil';
export { flushIfServerless } from './utils/flushIfServerless';
export { callFrameToStackFrame, watchdogTimer } from './utils/anr';
export { safeUnref as _INTERNAL_safeUnref } from './utils/timer';
/* oxlint-disable typescript/no-deprecated -- deprecated Express exports, kept until the next major */
export { patchExpressModule } from './integrations/express/index';
export type {
  ExpressIntegrationOptions,
  ExpressHandlerOptions,
  ExpressMiddleware,
  ExpressErrorMiddleware,
} from './integrations/express/types';
/* oxlint-enable typescript/no-deprecated */
export {
  instrumentPostgresJsSql,
  _sanitizeSqlQuery as _INTERNAL_sanitizeSqlQuery,
  _reconstructQuery as _INTERNAL_reconstructPostgresQuery,
  _buildConnectionContext as _INTERNAL_buildPostgresConnectionContext,
  _getConnectionAttributes as _INTERNAL_getConnectionAttributes,
  _getOperationName as _INTERNAL_getPostgresOperationName,
} from './integrations/postgresjs';
export type { PostgresConnectionContext } from './integrations/postgresjs';
export { getSqlQuerySummary as _INTERNAL_getSqlQuerySummary } from './utils/sql';

export { patchHttpModuleClient } from './integrations/http/client-patch';
export { getHttpClientSubscriptions } from './integrations/http/client-subscriptions';
export { getHttpServerSubscriptions, isStaticAssetRequest } from './integrations/http/server-subscription';
export { recordRequestSession } from './integrations/http/record-request-session';
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
