import {
  CLIENT_ADDRESS,
  CLIENT_PORT,
  ERROR_TYPE,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROMPT_NAME,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_NAME,
  JSONRPC_REQUEST_ID,
  MCP_CANCELLED_REASON,
  MCP_CANCELLED_REQUEST_ID,
  MCP_CLIENT_NAME,
  MCP_CLIENT_TITLE,
  MCP_CLIENT_VERSION,
  MCP_LOGGING_DATA_TYPE,
  MCP_LOGGING_LEVEL,
  MCP_LOGGING_LOGGER,
  MCP_LOGGING_MESSAGE,
  MCP_METHOD_NAME,
  MCP_PROGRESS_CURRENT,
  MCP_PROGRESS_MESSAGE,
  MCP_PROGRESS_PERCENTAGE,
  MCP_PROGRESS_TOTAL,
  MCP_PROMPT_NAME,
  MCP_PROMPT_RESULT_DESCRIPTION,
  MCP_PROMPT_RESULT_MESSAGE_COUNT,
  MCP_PROTOCOL_VERSION,
  MCP_REQUEST_ARGUMENT_KEY_BASE,
  MCP_REQUEST_ID,
  MCP_RESOURCE_URI,
  MCP_SERVER_NAME,
  MCP_SERVER_TITLE,
  MCP_SERVER_VERSION,
  MCP_SESSION_ID,
  MCP_TOOL_NAME,
  MCP_TOOL_RESULT_CONTENT,
  MCP_TOOL_RESULT_CONTENT_COUNT,
  MCP_TOOL_RESULT_IS_ERROR,
  MCP_TRANSPORT,
  NETWORK_PROTOCOL_NAME,
  NETWORK_TRANSPORT,
  RPC_RESPONSE_STATUS_CODE,
  SENTRY_KIND,
} from '@sentry/conventions/attributes';

/** OpenTelemetry MCP and JSON-RPC attributes available through `@sentry/conventions`. */
export const MCP_METHOD_NAME_ATTRIBUTE = MCP_METHOD_NAME;
export const MCP_REQUEST_ID_ATTRIBUTE = JSONRPC_REQUEST_ID;
export const MCP_SESSION_ID_ATTRIBUTE = MCP_SESSION_ID;
export const MCP_RESOURCE_URI_ATTRIBUTE = MCP_RESOURCE_URI;
export const MCP_PROTOCOL_VERSION_ATTRIBUTE = MCP_PROTOCOL_VERSION;
export const MCP_CLIENT_NAME_ATTRIBUTE = MCP_CLIENT_NAME;
export const MCP_CLIENT_TITLE_ATTRIBUTE = MCP_CLIENT_TITLE;
export const MCP_CLIENT_VERSION_ATTRIBUTE = MCP_CLIENT_VERSION;
export const MCP_SERVER_NAME_ATTRIBUTE = MCP_SERVER_NAME;
export const MCP_SERVER_TITLE_ATTRIBUTE = MCP_SERVER_TITLE;
export const MCP_SERVER_VERSION_ATTRIBUTE = MCP_SERVER_VERSION;
export const MCP_TOOL_NAME_ATTRIBUTE = GEN_AI_TOOL_NAME;
export const MCP_PROMPT_NAME_ATTRIBUTE = GEN_AI_PROMPT_NAME;
export const MCP_TOOL_ARGUMENTS_ATTRIBUTE = GEN_AI_TOOL_CALL_ARGUMENTS;
export const MCP_TOOL_RESULT_ATTRIBUTE = GEN_AI_TOOL_CALL_RESULT;
export const GEN_AI_OPERATION_NAME_ATTRIBUTE = GEN_AI_OPERATION_NAME;
export const ERROR_TYPE_ATTRIBUTE = ERROR_TYPE;
export const RPC_RESPONSE_STATUS_CODE_ATTRIBUTE = RPC_RESPONSE_STATUS_CODE;
export const NETWORK_TRANSPORT_ATTRIBUTE = NETWORK_TRANSPORT;
export const NETWORK_PROTOCOL_NAME_ATTRIBUTE = NETWORK_PROTOCOL_NAME;
export const CLIENT_ADDRESS_ATTRIBUTE = CLIENT_ADDRESS;
export const CLIENT_PORT_ATTRIBUTE = CLIENT_PORT;
export const SENTRY_KIND_ATTRIBUTE = SENTRY_KIND;

/** Historical Sentry MCP attributes retained during the canonical-name migration. */
// oxlint-disable-next-line typescript/no-deprecated -- Required for backward-compatible telemetry.
export const LEGACY_MCP_REQUEST_ID_ATTRIBUTE = MCP_REQUEST_ID;
// oxlint-disable-next-line typescript/no-deprecated -- Required for backward-compatible telemetry.
export const LEGACY_MCP_TOOL_NAME_ATTRIBUTE = MCP_TOOL_NAME;
// oxlint-disable-next-line typescript/no-deprecated -- Required for backward-compatible telemetry.
export const LEGACY_MCP_PROMPT_NAME_ATTRIBUTE = MCP_PROMPT_NAME;
// oxlint-disable-next-line typescript/no-deprecated -- Required for backward-compatible telemetry.
export const MCP_TRANSPORT_ATTRIBUTE = MCP_TRANSPORT;
export const MCP_REQUEST_ARGUMENT = MCP_REQUEST_ARGUMENT_KEY_BASE;
// oxlint-disable-next-line typescript/no-deprecated -- Required for backward-compatible telemetry.
export const MCP_TOOL_RESULT_IS_ERROR_ATTRIBUTE = MCP_TOOL_RESULT_IS_ERROR;
export const MCP_TOOL_RESULT_CONTENT_COUNT_ATTRIBUTE = MCP_TOOL_RESULT_CONTENT_COUNT;
// oxlint-disable-next-line typescript/no-deprecated -- Required for backward-compatible telemetry.
export const MCP_TOOL_RESULT_CONTENT_ATTRIBUTE = MCP_TOOL_RESULT_CONTENT;

/** Sentry MCP extensions which do not yet have accepted OpenTelemetry attributes. */
export const MCP_RESULT_TYPE_ATTRIBUTE = 'mcp.result.type';
export const MCP_CACHE_TTL_ATTRIBUTE = 'mcp.cache.ttl_ms';
export const MCP_CACHE_SCOPE_ATTRIBUTE = 'mcp.cache.scope';
export const MCP_RESULT_COUNT_ATTRIBUTE = 'mcp.result.count';
export const MCP_RESULT_TOTAL_COUNT_ATTRIBUTE = 'mcp.result.total_count';
export const MCP_RESULT_HAS_MORE_ATTRIBUTE = 'mcp.result.has_more';
export const MCP_PAGINATION_CURSOR_PRESENT_ATTRIBUTE = 'mcp.pagination.cursor.present';
export const MCP_PAGINATION_NEXT_CURSOR_PRESENT_ATTRIBUTE = 'mcp.pagination.next_cursor.present';
export const MCP_COMPLETION_REFERENCE_TYPE_ATTRIBUTE = 'mcp.completion.reference.type';
export const MCP_RESOURCE_RESULT_MIME_TYPES_ATTRIBUTE = 'mcp.resource.result.mime_types';
export const MCP_INPUT_REQUEST_COUNT_ATTRIBUTE = 'mcp.input_request.count';
export const MCP_INPUT_REQUEST_METHODS_ATTRIBUTE = 'mcp.input_request.methods';
export const MCP_INPUT_RESPONSE_COUNT_ATTRIBUTE = 'mcp.input_response.count';
export const MCP_REQUEST_STATE_PRESENT_ATTRIBUTE = 'mcp.request_state.present';
export const MCP_REQUEST_OUTCOME_ATTRIBUTE = 'mcp.request.outcome';
export const MCP_DISCOVERY_PROTOCOL_VERSIONS_ATTRIBUTE = 'mcp.discovery.protocol_versions';
export const MCP_DISCOVERY_EXTENSION_IDS_ATTRIBUTE = 'mcp.discovery.extension_ids';
export const MCP_SERVER_CAPABILITIES_ATTRIBUTE = 'mcp.server.capabilities';
export const MCP_CLIENT_CAPABILITIES_ATTRIBUTE = 'mcp.client.capabilities';
export const MCP_CLIENT_EXTENSION_IDS_ATTRIBUTE = 'mcp.client.extension_ids';
export const MCP_SUBSCRIPTION_ID_ATTRIBUTE = 'mcp.subscription.id';
export const MCP_LOGGING_REQUESTED_LEVEL_ATTRIBUTE = 'mcp.logging.requested_level';
export const MCP_PROMPT_VARIABLE_ATTRIBUTE_PREFIX = 'gen_ai.prompt.variable';

export const MCP_CANCELLED_REQUEST_ID_ATTRIBUTE = MCP_CANCELLED_REQUEST_ID;
export const MCP_CANCELLED_REASON_ATTRIBUTE = MCP_CANCELLED_REASON;
export const MCP_PROGRESS_CURRENT_ATTRIBUTE = MCP_PROGRESS_CURRENT;
export const MCP_PROGRESS_TOTAL_ATTRIBUTE = MCP_PROGRESS_TOTAL;
export const MCP_PROGRESS_PERCENTAGE_ATTRIBUTE = MCP_PROGRESS_PERCENTAGE;
export const MCP_PROGRESS_MESSAGE_ATTRIBUTE = MCP_PROGRESS_MESSAGE;
export const MCP_LOGGING_LEVEL_ATTRIBUTE = MCP_LOGGING_LEVEL;
export const MCP_LOGGING_LOGGER_ATTRIBUTE = MCP_LOGGING_LOGGER;
export const MCP_LOGGING_DATA_TYPE_ATTRIBUTE = MCP_LOGGING_DATA_TYPE;
export const MCP_LOGGING_MESSAGE_ATTRIBUTE = MCP_LOGGING_MESSAGE;
export const MCP_PROMPT_RESULT_DESCRIPTION_ATTRIBUTE = MCP_PROMPT_RESULT_DESCRIPTION;
export const MCP_PROMPT_RESULT_MESSAGE_COUNT_ATTRIBUTE = MCP_PROMPT_RESULT_MESSAGE_COUNT;
export const MCP_TOOL_RESULT_PREFIX = 'mcp.tool.result';
export const MCP_PROMPT_RESULT_PREFIX = 'mcp.prompt.result';

/** Sentry operation value for MCP server spans. */
export const MCP_SERVER_OP_VALUE = 'mcp.server';
export const MCP_NOTIFICATION_CLIENT_TO_SERVER_OP_VALUE = 'mcp.notification.client_to_server';
export const MCP_NOTIFICATION_SERVER_TO_CLIENT_OP_VALUE = 'mcp.notification.server_to_client';
export const MCP_FUNCTION_ORIGIN_VALUE = 'auto.function.mcp_server';
export const MCP_NOTIFICATION_ORIGIN_VALUE = 'auto.mcp.notification';
