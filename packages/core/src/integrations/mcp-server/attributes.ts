/**
 * Essential MCP attribute constants for Sentry instrumentation
 *
 * Based on OpenTelemetry MCP semantic conventions
 * @see https://github.com/open-telemetry/semantic-conventions/blob/3097fb0af5b9492b0e3f55dc5f6c21a3dc2be8df/docs/gen-ai/mcp.md
 */

// =============================================================================
// CORE MCP ATTRIBUTES
// =============================================================================

/** The name of the request or notification method */
export const MCP_METHOD_NAME_ATTRIBUTE = 'mcp.method.name';

/** JSON-RPC request identifier for the request. Unique within the MCP session. */
export const MCP_REQUEST_ID_ATTRIBUTE = 'mcp.request.id';

/** Identifies the MCP session */
export const MCP_SESSION_ID_ATTRIBUTE = 'mcp.session.id';

/** Transport method used for MCP communication */
export const MCP_TRANSPORT_ATTRIBUTE = 'mcp.transport';

// =============================================================================
// CLIENT ATTRIBUTES
// =============================================================================

/** Name of the MCP client application */
export const MCP_CLIENT_NAME_ATTRIBUTE = 'mcp.client.name';

/** Display title of the MCP client application */
export const MCP_CLIENT_TITLE_ATTRIBUTE = 'mcp.client.title';

/** Version of the MCP client application */
export const MCP_CLIENT_VERSION_ATTRIBUTE = 'mcp.client.version';

// =============================================================================
// SERVER ATTRIBUTES
// =============================================================================

/** Name of the MCP server application */
export const MCP_SERVER_NAME_ATTRIBUTE = 'mcp.server.name';

/** Display title of the MCP server application */
export const MCP_SERVER_TITLE_ATTRIBUTE = 'mcp.server.title';

/** Version of the MCP server application */
export const MCP_SERVER_VERSION_ATTRIBUTE = 'mcp.server.version';

/** MCP protocol version used in the session */
export const MCP_PROTOCOL_VERSION_ATTRIBUTE = 'mcp.protocol.version';

// =============================================================================
// METHOD-SPECIFIC ATTRIBUTES
// =============================================================================

/** Name of the tool being called */
export const MCP_TOOL_NAME_ATTRIBUTE = 'mcp.tool.name';

/** The resource URI being accessed */
export const MCP_RESOURCE_URI_ATTRIBUTE = 'mcp.resource.uri';

/** Name of the prompt template */
export const MCP_PROMPT_NAME_ATTRIBUTE = 'mcp.prompt.name';

// =============================================================================
// TOOL RESULT ATTRIBUTES
// =============================================================================

/** Whether a tool execution resulted in an error */
export const MCP_TOOL_RESULT_IS_ERROR_ATTRIBUTE = 'mcp.tool.result.is_error';

/** Number of content items in the tool result */
export const MCP_TOOL_RESULT_CONTENT_COUNT_ATTRIBUTE = 'mcp.tool.result.content_count';

/** Serialized content of the tool result */
export const MCP_TOOL_RESULT_CONTENT_ATTRIBUTE = 'mcp.tool.result.content';

// =============================================================================
// REQUEST ARGUMENT ATTRIBUTES
// =============================================================================

/** Prefix for MCP request argument prefix for each argument */
export const MCP_REQUEST_ARGUMENT = 'mcp.request.argument';

// =============================================================================
// LOGGING ATTRIBUTES
// =============================================================================

/** Log level for MCP logging operations */
export const MCP_LOGGING_LEVEL_ATTRIBUTE = 'mcp.logging.level';

/** Logger name for MCP logging operations */
export const MCP_LOGGING_LOGGER_ATTRIBUTE = 'mcp.logging.logger';

/** Data type of the logged message */
export const MCP_LOGGING_DATA_TYPE_ATTRIBUTE = 'mcp.logging.data_type';

/** Log message content */
export const MCP_LOGGING_MESSAGE_ATTRIBUTE = 'mcp.logging.message';

// =============================================================================
// NETWORK ATTRIBUTES (OpenTelemetry Standard)
// =============================================================================

/** OSI transport layer protocol */
export const NETWORK_TRANSPORT_ATTRIBUTE = 'network.transport';

/** The version of JSON RPC protocol used */
export const NETWORK_PROTOCOL_VERSION_ATTRIBUTE = 'network.protocol.version';

/** Client address - domain name if available without reverse DNS lookup; otherwise, IP address or Unix domain socket name */
export const CLIENT_ADDRESS_ATTRIBUTE = 'client.address';

/** Client port number */
export const CLIENT_PORT_ATTRIBUTE = 'client.port';

// =============================================================================
// SENTRY-SPECIFIC MCP ATTRIBUTE VALUES
// =============================================================================

/** Sentry operation value for MCP server spans */
export const MCP_SERVER_OP_VALUE = 'mcp.server';

/**
 * Sentry operation value for client-to-server notifications
 * Following OpenTelemetry MCP semantic conventions
 */
export const MCP_NOTIFICATION_CLIENT_TO_SERVER_OP_VALUE = 'mcp.notification.client_to_server';

/**
 * Sentry operation value for server-to-client notifications
 * Following OpenTelemetry MCP semantic conventions
 */
export const MCP_NOTIFICATION_SERVER_TO_CLIENT_OP_VALUE = 'mcp.notification.server_to_client';

/** Sentry origin value for MCP function spans */
export const MCP_FUNCTION_ORIGIN_VALUE = 'auto.function.mcp_server';

/** Sentry origin value for MCP notification spans */
export const MCP_NOTIFICATION_ORIGIN_VALUE = 'auto.mcp.notification';

/** Sentry source value for MCP route spans */
export const MCP_ROUTE_SOURCE_VALUE = 'route';
