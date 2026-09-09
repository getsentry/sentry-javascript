/**
 * Server-only utilities for Sentry SDKs.
 *
 * @module
 */

export { wrapMcpServerWithSentry } from './integrations/mcp-server';
export { isNodeEnv } from './utils/node';
export { safeUnref as _INTERNAL_safeUnref } from './utils/timer';
export { patchHttpModuleClient } from './integrations/http/client-patch';
export { getHttpClientSubscriptions } from './integrations/http/client-subscriptions';
export { getHttpServerSubscriptions, isStaticAssetRequest } from './integrations/http/server-subscription';
export {
  DEFAULT_IGNORE_STATUS_CODES,
  processHttpServerTransactionEvent,
} from './integrations/http/server-transaction-event';
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
