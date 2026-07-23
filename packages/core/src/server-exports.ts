/**
 * Server-only utilities for Sentry SDKs.
 *
 * @module
 */

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
// eslint-disable-next-line typescript/no-deprecated
export { patchExpressModule, setupExpressErrorHandler, expressErrorHandler } from './integrations/express/index';
export type {
  ExpressIntegrationOptions,
  ExpressHandlerOptions,
  ExpressMiddleware,
  ExpressErrorMiddleware,
} from './integrations/express/types';
export {
  instrumentPostgresJsSql,
  _sanitizeSqlQuery as _INTERNAL_sanitizeSqlQuery,
  _reconstructQuery as _INTERNAL_reconstructPostgresQuery,
  _buildConnectionContext as _INTERNAL_buildPostgresConnectionContext,
  _setConnectionAttributes as _INTERNAL_setPostgresConnectionAttributes,
  _setOperationName as _INTERNAL_setPostgresOperationName,
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

// AI instrumentation is only supported in server runtimes, so these exports are kept out of the browser entry to
// avoid shipping the AI tracing code in browser bundles.
export { addVercelAiProcessors, getProviderMetadataAttributes } from './tracing/vercel-ai';
export { getTruncatedJsonString, shouldEnableTruncation, resolveAIRecordingOptions } from './tracing/ai/utils';
export { GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE } from './tracing/ai/gen-ai-attributes';
export { _INTERNAL_getSpanContextForToolCallId, _INTERNAL_cleanupToolCallSpanContext } from './tracing/vercel-ai/utils';
export { toolCallSpanContextMap as _INTERNAL_toolCallSpanContextMap } from './tracing/vercel-ai/constants';
export {
  instrumentOpenAiClient,
  extractRequestAttributes as extractOpenAiRequestAttributes,
  addRequestAttributes as addOpenAiRequestAttributes,
} from './tracing/openai';
export {
  addResponseAttributes as addOpenAiResponseAttributes,
  extractRequestParameters as extractOpenAiRequestParameters,
} from './tracing/openai/utils';
export { instrumentStream as instrumentOpenAiStream } from './tracing/openai/streaming';
export { OPENAI_INTEGRATION_NAME } from './tracing/openai/constants';
export {
  instrumentAnthropicAiClient,
  extractRequestAttributes as extractAnthropicRequestAttributes,
  addPrivateRequestAttributes as addAnthropicRequestAttributes,
  addResponseAttributes as addAnthropicResponseAttributes,
} from './tracing/anthropic-ai';
export { instrumentAsyncIterableStream, instrumentMessageStream } from './tracing/anthropic-ai/streaming';
export { ANTHROPIC_AI_INTEGRATION_NAME } from './tracing/anthropic-ai/constants';
export {
  instrumentGoogleGenAIClient,
  extractRequestAttributes as extractGoogleGenAIRequestAttributes,
  addPrivateRequestAttributes as addGoogleGenAIRequestAttributes,
  addResponseAttributes as addGoogleGenAIResponseAttributes,
} from './tracing/google-genai';
export { instrumentStream as instrumentGoogleGenAIStream } from './tracing/google-genai/streaming';
export { GOOGLE_GENAI_INTEGRATION_NAME } from './tracing/google-genai/constants';
export type { GoogleGenAIResponse } from './tracing/google-genai/types';
export { createLangChainCallbackHandler, instrumentLangChainEmbeddings } from './tracing/langchain';
export { _INTERNAL_getLangChainEmbeddingsSpanOptions } from './tracing/langchain/embeddings';
export { _INTERNAL_mergeLangChainCallbackHandler } from './tracing/langchain/utils';
export { LANGCHAIN_INTEGRATION_NAME } from './tracing/langchain/constants';
export type { LangChainOptions, LangChainIntegration } from './tracing/langchain/types';
export {
  instrumentStateGraphCompile,
  instrumentCreateReactAgent,
  instrumentStateGraph,
  instrumentCompiledGraphInvoke,
  _INTERNAL_getLangGraphCreateAgentSpanOptions,
} from './tracing/langgraph';
export { wrapToolsWithSpans, extractLLMFromParams, extractAgentNameFromParams } from './tracing/langgraph/utils';
export { LANGGRAPH_INTEGRATION_NAME } from './tracing/langgraph/constants';
export type { LangGraphOptions, LangGraphIntegration, CompiledGraph } from './tracing/langgraph/types';
export { instrumentWorkersAiClient } from './tracing/workers-ai';
export type { WorkersAiClient, WorkersAiOptions } from './tracing/workers-ai/types';
// eslint-disable-next-line typescript/no-deprecated
export type { OpenAiClient, OpenAiOptions, InstrumentedMethod } from './tracing/openai/types';
export type {
  AnthropicAiClient,
  AnthropicAiOptions,
  // eslint-disable-next-line typescript/no-deprecated
  AnthropicAiInstrumentedMethod,
  AnthropicAiResponse,
} from './tracing/anthropic-ai/types';
export type {
  GoogleGenAIClient,
  GoogleGenAIChat,
  GoogleGenAIOptions,
  GoogleGenAIInstrumentedMethod,
} from './tracing/google-genai/types';
// eslint-disable-next-line typescript/no-deprecated
export type { GoogleGenAIIstrumentedMethod } from './tracing/google-genai/types';
