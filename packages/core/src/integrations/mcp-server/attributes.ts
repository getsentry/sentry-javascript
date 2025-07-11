/**
 * Essential MCP attribute constants for Sentry instrumentation
 *
 * Based on OpenTelemetry MCP semantic conventions
 * @see https://github.com/open-telemetry/semantic-conventions/blob/3097fb0af5b9492b0e3f55dc5f6c21a3dc2be8df/docs/gen-ai/mcp.md
 */

// =============================================================================
// CORE MCP ATTRIBUTES
// =============================================================================

/**
 * The name of the request or notification method
 * @see https://github.com/open-telemetry/semantic-conventions/blob/3097fb0af5b9492b0e3f55dc5f6c21a3dc2be8df/docs/gen-ai/mcp.md#required-attributes
 */
export const MCP_METHOD_NAME_ATTRIBUTE = 'mcp.method.name';

/**
 * Unique identifier for the request
 * @see https://github.com/open-telemetry/semantic-conventions/blob/3097fb0af5b9492b0e3f55dc5f6c21a3dc2be8df/docs/gen-ai/mcp.md#recommended-attributes
 */
export const MCP_REQUEST_ID_ATTRIBUTE = 'mcp.request.id';

/**
 * Identifies the MCP session
 * @see https://github.com/open-telemetry/semantic-conventions/blob/3097fb0af5b9492b0e3f55dc5f6c21a3dc2be8df/docs/gen-ai/mcp.md#recommended-attributes
 */
export const MCP_SESSION_ID_ATTRIBUTE = 'mcp.session.id';

/**
 * Transport method used for MCP communication
 * @see https://github.com/open-telemetry/semantic-conventions/blob/3097fb0af5b9492b0e3f55dc5f6c21a3dc2be8df/docs/gen-ai/mcp.md#recommended-attributes
 */
export const MCP_TRANSPORT_ATTRIBUTE = 'mcp.transport';

// =============================================================================
// METHOD-SPECIFIC ATTRIBUTES
// =============================================================================

/**
 * Name of the tool being called
 * @see https://github.com/open-telemetry/semantic-conventions/blob/3097fb0af5b9492b0e3f55dc5f6c21a3dc2be8df/docs/gen-ai/mcp.md#method-specific-attributes
 */
export const MCP_TOOL_NAME_ATTRIBUTE = 'mcp.tool.name';

/**
 * The resource URI being accessed
 * @see https://github.com/open-telemetry/semantic-conventions/blob/3097fb0af5b9492b0e3f55dc5f6c21a3dc2be8df/docs/gen-ai/mcp.md#method-specific-attributes
 */
export const MCP_RESOURCE_URI_ATTRIBUTE = 'mcp.resource.uri';

/**
 * Name of the prompt template
 * @see https://github.com/open-telemetry/semantic-conventions/blob/3097fb0af5b9492b0e3f55dc5f6c21a3dc2be8df/docs/gen-ai/mcp.md#method-specific-attributes
 */
export const MCP_PROMPT_NAME_ATTRIBUTE = 'mcp.prompt.name';

// =============================================================================
// TOOL RESULT ATTRIBUTES
// =============================================================================

/**
 * Whether a tool execution resulted in an error
 */
export const MCP_TOOL_RESULT_IS_ERROR_ATTRIBUTE = 'mcp.tool.result.is_error';

/**
 * Number of content items in the tool result
 */
export const MCP_TOOL_RESULT_CONTENT_COUNT_ATTRIBUTE = 'mcp.tool.result.content_count';

/**
 * Serialized content of the tool result
 */
export const MCP_TOOL_RESULT_CONTENT_ATTRIBUTE = 'mcp.tool.result.content';

// =============================================================================
// NETWORK ATTRIBUTES (OpenTelemetry Standard)
// =============================================================================

/**
 * OSI transport layer protocol
 * @see https://github.com/open-telemetry/semantic-conventions/blob/3097fb0af5b9492b0e3f55dc5f6c21a3dc2be8df/docs/gen-ai/mcp.md#network-attributes
 */
export const NETWORK_TRANSPORT_ATTRIBUTE = 'network.transport';

/**
 * The version of JSON RPC protocol used
 * @see https://github.com/open-telemetry/semantic-conventions/blob/3097fb0af5b9492b0e3f55dc5f6c21a3dc2be8df/docs/gen-ai/mcp.md#network-attributes
 */
export const NETWORK_PROTOCOL_VERSION_ATTRIBUTE = 'network.protocol.version';

/**
 * Client address - domain name if available without reverse DNS lookup; otherwise, IP address or Unix domain socket name
 * @see https://github.com/open-telemetry/semantic-conventions/blob/3097fb0af5b9492b0e3f55dc5f6c21a3dc2be8df/docs/gen-ai/mcp.md#network-attributes
 */
export const CLIENT_ADDRESS_ATTRIBUTE = 'client.address';

/**
 * Client port number
 * @see https://github.com/open-telemetry/semantic-conventions/blob/3097fb0af5b9492b0e3f55dc5f6c21a3dc2be8df/docs/gen-ai/mcp.md#network-attributes
 */
export const CLIENT_PORT_ATTRIBUTE = 'client.port';

// =============================================================================
// SENTRY-SPECIFIC MCP ATTRIBUTE VALUES
// =============================================================================

/**
 * Sentry operation value for MCP server spans
 */
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

/**
 * Sentry origin value for MCP function spans
 */
export const MCP_FUNCTION_ORIGIN_VALUE = 'auto.function.mcp_server';

/**
 * Sentry origin value for MCP notification spans
 */
export const MCP_NOTIFICATION_ORIGIN_VALUE = 'auto.mcp.notification';

/**
 * Sentry source value for MCP route spans
 */
export const MCP_ROUTE_SOURCE_VALUE = 'route';
