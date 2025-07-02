/**
 * Model Context Protocol (MCP) Semantic Conventions for Sentry
 * 
 * Based on OpenTelemetry MCP semantic conventions:
 * https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/mcp.md
 * 
 * These attributes follow the MCP specification for distributed tracing and monitoring.
 */

// =============================================================================
// CORE MCP ATTRIBUTES
// =============================================================================

/**
 * The name of the request or notification method
 * @see https://github.com/open-telemetry/semantic-conventions/blob/main/docs/registry/attributes/mcp.md
 * 
 * Well-known values:
 * - completion/complete
 * - initialize  
 * - logging/setLevel
 * - notifications/cancelled
 * - notifications/initialized
 * - notifications/message
 * - notifications/prompts/list_changed
 * - notifications/resources/list_changed
 * - notifications/resources/updated
 * - notifications/roots/list_changed
 * - notifications/tools/list_changed
 * - ping
 * - prompts/get
 * - prompts/list
 * - resources/list
 * - resources/read
 * - resources/subscribe
 * - resources/templates/list
 * - resources/unsubscribe
 * - roots/list
 * - sampling/createMessage
 * - tools/call
 * - tools/list
 */
export const MCP_METHOD_NAME_ATTRIBUTE = 'mcp.method.name';

/**
 * Unique identifier for the request
 * Examples: "42", "req_123456"
 */
export const MCP_REQUEST_ID_ATTRIBUTE = 'mcp.request.id';

/**
 * Identifies the MCP session
 * Examples: "191c4850af6c49e08843a3f6c80e5046"
 */
export const MCP_SESSION_ID_ATTRIBUTE = 'mcp.session.id';

/**
 * Transport method used for MCP communication
 * Values: "stdio", "sse", "http", "websocket"
 */
export const MCP_TRANSPORT_ATTRIBUTE = 'mcp.transport';

// =============================================================================
// METHOD-SPECIFIC ATTRIBUTES
// =============================================================================

/**
 * Name of the tool being called
 * Examples: "get-weather", "execute_command", "search_docs"
 */
export const MCP_TOOL_NAME_ATTRIBUTE = 'mcp.tool.name';

/**
 * The resource URI being accessed
 * Examples: "file:///home/user/documents/report.pdf", "postgres://db/customers"
 */
export const MCP_RESOURCE_URI_ATTRIBUTE = 'mcp.resource.uri';

/**
 * Human-readable resource name
 * Examples: "sentry-docs-platform", "project-config"
 */
export const MCP_RESOURCE_NAME_ATTRIBUTE = 'mcp.resource.name';

/**
 * Name of the prompt template
 * Examples: "analyze-code", "generate-summary"
 */
export const MCP_PROMPT_NAME_ATTRIBUTE = 'mcp.prompt.name';

/**
 * Resource protocol extracted from URI
 * Examples: "file:", "postgres:", "http:"
 */
export const MCP_RESOURCE_PROTOCOL_ATTRIBUTE = 'mcp.resource.protocol';

// =============================================================================
// REQUEST ARGUMENT ATTRIBUTES
// =============================================================================

/**
 * Base prefix for request arguments
 * Security Note: Instrumentations SHOULD require explicit configuration
 * of which arguments are captured to avoid leaking sensitive information.
 */
export const MCP_REQUEST_ARGUMENT_PREFIX = 'mcp.request.argument.';

/**
 * Helper function to create request argument attribute names
 * @param key The argument key (will be lowercased)
 * @returns Full attribute name
 */
export function getMcpRequestArgumentAttribute(key: string): string {
  return `${MCP_REQUEST_ARGUMENT_PREFIX}${key.toLowerCase()}`;
}

// =============================================================================
// NOTIFICATION ATTRIBUTES
// =============================================================================

/**
 * Direction of the notification
 * Values: "client_to_server", "server_to_client"
 */
export const MCP_NOTIFICATION_DIRECTION_ATTRIBUTE = 'mcp.notification.direction';

/**
 * Request ID for cancelled notifications
 */
export const MCP_CANCELLED_REQUEST_ID_ATTRIBUTE = 'mcp.cancelled.request_id';

/**
 * Reason for cancellation
 */
export const MCP_CANCELLED_REASON_ATTRIBUTE = 'mcp.cancelled.reason';

/**
 * Progress token identifier
 */
export const MCP_PROGRESS_TOKEN_ATTRIBUTE = 'mcp.progress.token';

/**
 * Current progress value
 */
export const MCP_PROGRESS_CURRENT_ATTRIBUTE = 'mcp.progress.current';

/**
 * Total progress value
 */
export const MCP_PROGRESS_TOTAL_ATTRIBUTE = 'mcp.progress.total';

/**
 * Progress percentage (calculated)
 */
export const MCP_PROGRESS_PERCENTAGE_ATTRIBUTE = 'mcp.progress.percentage';

/**
 * Progress message
 */
export const MCP_PROGRESS_MESSAGE_ATTRIBUTE = 'mcp.progress.message';

/**
 * Logging level
 */
export const MCP_LOGGING_LEVEL_ATTRIBUTE = 'mcp.logging.level';

/**
 * Logger name
 */
export const MCP_LOGGING_LOGGER_ATTRIBUTE = 'mcp.logging.logger';

/**
 * Type of logging data
 */
export const MCP_LOGGING_DATA_TYPE_ATTRIBUTE = 'mcp.logging.data_type';

/**
 * Actual logging message content
 */
export const MCP_LOGGING_MESSAGE_ATTRIBUTE = 'mcp.logging.message';

// =============================================================================
// NETWORK ATTRIBUTES (OpenTelemetry Standard)
// =============================================================================

/**
 * OSI transport layer protocol
 * Values: "pipe" (for stdio), "tcp" (for HTTP/SSE), "udp", "quic", "unix"
 */
export const NETWORK_TRANSPORT_ATTRIBUTE = 'network.transport';

/**
 * Version of JSON RPC protocol used
 * Examples: "1.1", "2.0"
 */
export const NETWORK_PROTOCOL_VERSION_ATTRIBUTE = 'network.protocol.version';

/**
 * Client address - domain name if available without reverse DNS lookup; otherwise, IP address or Unix domain socket name
 * Examples: "client.example.com", "10.1.2.80", "/tmp/my.sock"
 */
export const CLIENT_ADDRESS_ATTRIBUTE = 'client.address';

/**
 * Client port number
 * Example: 65123
 */
export const CLIENT_PORT_ATTRIBUTE = 'client.port';

// =============================================================================
// ERROR ATTRIBUTES (OpenTelemetry Standard)
// =============================================================================

/**
 * Error type for failed operations
 * - Should be set to the string representation of the JSON RPC error code
 * - When JSON RPC call is successful but an error is returned within the result payload,
 *   should be set to low-cardinality string representation of the error
 * - When CallToolResult is returned with isError set to true, should be set to "tool_error"
 */
export const ERROR_TYPE_ATTRIBUTE = 'error.type';

/**
 * JSON-RPC error code (numeric)
 * Examples: -32700, 100
 */
export const RPC_JSONRPC_ERROR_CODE_ATTRIBUTE = 'rpc.jsonrpc.error_code';

// =============================================================================
// COMMON JSON-RPC ERROR CODES
// =============================================================================

export const JSON_RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Server error range: -32000 to -32099
} as const;

export const JSON_RPC_ERROR_MESSAGES = {
  [JSON_RPC_ERROR_CODES.PARSE_ERROR]: 'Parse error',
  [JSON_RPC_ERROR_CODES.INVALID_REQUEST]: 'Invalid Request',
  [JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND]: 'Method not found',
  [JSON_RPC_ERROR_CODES.INVALID_PARAMS]: 'Invalid params',
  [JSON_RPC_ERROR_CODES.INTERNAL_ERROR]: 'Internal error',
} as const;

/**
 * Special error type for tool execution failures
 */
export const TOOL_ERROR_TYPE = 'tool_error';

// =============================================================================
// TRANSPORT TYPE MAPPINGS
// =============================================================================

/**
 * MCP transport types (application level)
 */
export const MCP_TRANSPORT_TYPES = {
  STDIO: 'stdio',
  SSE: 'sse', 
  HTTP: 'http',
  WEBSOCKET: 'websocket',
} as const;

/**
 * Network transport types (network level)
 */
export const NETWORK_TRANSPORT_TYPES = {
  PIPE: 'pipe',    // For stdio
  TCP: 'tcp',      // For HTTP/SSE/WebSocket
  UDP: 'udp',
  QUIC: 'quic',
  UNIX: 'unix',
} as const;

/**
 * Mapping from MCP transport to network transport
 */
export const MCP_TO_NETWORK_TRANSPORT_MAP = {
  [MCP_TRANSPORT_TYPES.STDIO]: NETWORK_TRANSPORT_TYPES.PIPE,
  [MCP_TRANSPORT_TYPES.SSE]: NETWORK_TRANSPORT_TYPES.TCP,
  [MCP_TRANSPORT_TYPES.HTTP]: NETWORK_TRANSPORT_TYPES.TCP,
  [MCP_TRANSPORT_TYPES.WEBSOCKET]: NETWORK_TRANSPORT_TYPES.TCP,
} as const;

// =============================================================================
// WELL-KNOWN MCP METHOD NAMES
// =============================================================================

export const MCP_METHODS = {
  // Core methods
  INITIALIZE: 'initialize',
  PING: 'ping',
  
  // Tool operations
  TOOLS_LIST: 'tools/list',
  TOOLS_CALL: 'tools/call',
  
  // Resource operations
  RESOURCES_LIST: 'resources/list',
  RESOURCES_READ: 'resources/read',
  RESOURCES_SUBSCRIBE: 'resources/subscribe',
  RESOURCES_UNSUBSCRIBE: 'resources/unsubscribe',
  RESOURCES_TEMPLATES_LIST: 'resources/templates/list',
  
  // Prompt operations
  PROMPTS_LIST: 'prompts/list',
  PROMPTS_GET: 'prompts/get',
  
  // Root operations
  ROOTS_LIST: 'roots/list',
  
  // Completion operations
  COMPLETION_COMPLETE: 'completion/complete',
  
  // Sampling operations
  SAMPLING_CREATE_MESSAGE: 'sampling/createMessage',
  
  // Logging operations
  LOGGING_SET_LEVEL: 'logging/setLevel',
  
  // Notifications
  NOTIFICATIONS_INITIALIZED: 'notifications/initialized',
  NOTIFICATIONS_CANCELLED: 'notifications/cancelled',
  NOTIFICATIONS_MESSAGE: 'notifications/message',
  NOTIFICATIONS_PROMPTS_LIST_CHANGED: 'notifications/prompts/list_changed',
  NOTIFICATIONS_RESOURCES_LIST_CHANGED: 'notifications/resources/list_changed',
  NOTIFICATIONS_RESOURCES_UPDATED: 'notifications/resources/updated',
  NOTIFICATIONS_ROOTS_LIST_CHANGED: 'notifications/roots/list_changed',
  NOTIFICATIONS_TOOLS_LIST_CHANGED: 'notifications/tools/list_changed',
} as const;

// =============================================================================
// ATTRIBUTE GROUPS FOR DIFFERENT OPERATIONS
// =============================================================================

/**
 * Required attributes for all MCP server spans
 */
export const MCP_SERVER_REQUIRED_ATTRIBUTES = [
  MCP_METHOD_NAME_ATTRIBUTE,
] as const;

/**
 * Conditionally required attributes (when applicable)
 */
export const MCP_SERVER_CONDITIONALLY_REQUIRED_ATTRIBUTES = [
  ERROR_TYPE_ATTRIBUTE,                    // If operation fails
  RPC_JSONRPC_ERROR_CODE_ATTRIBUTE,       // If response contains error code
  MCP_REQUEST_ID_ATTRIBUTE,               // When client executes a request
  MCP_TOOL_NAME_ATTRIBUTE,                // When operation is related to a specific tool
  MCP_PROMPT_NAME_ATTRIBUTE,              // When operation is related to a specific prompt
  MCP_RESOURCE_URI_ATTRIBUTE,             // When client executes a request type that includes a resource URI parameter
] as const;

/**
 * Recommended attributes for MCP server spans
 */
export const MCP_SERVER_RECOMMENDED_ATTRIBUTES = [
  MCP_SESSION_ID_ATTRIBUTE,
  CLIENT_ADDRESS_ATTRIBUTE,
  CLIENT_PORT_ATTRIBUTE,
  NETWORK_TRANSPORT_ATTRIBUTE,
  NETWORK_PROTOCOL_VERSION_ATTRIBUTE,
] as const;

/**
 * Tool-specific attributes
 */
export const MCP_TOOL_ATTRIBUTES = [
  MCP_TOOL_NAME_ATTRIBUTE,
] as const;

/**
 * Resource-specific attributes
 */
export const MCP_RESOURCE_ATTRIBUTES = [
  MCP_RESOURCE_URI_ATTRIBUTE,
  MCP_RESOURCE_NAME_ATTRIBUTE,
  MCP_RESOURCE_PROTOCOL_ATTRIBUTE,
] as const;

/**
 * Prompt-specific attributes
 */
export const MCP_PROMPT_ATTRIBUTES = [
  MCP_PROMPT_NAME_ATTRIBUTE,
] as const;

/**
 * Notification-specific attributes
 */
export const MCP_NOTIFICATION_ATTRIBUTES = [
  MCP_NOTIFICATION_DIRECTION_ATTRIBUTE,
] as const; 