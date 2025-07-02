/**
 * TypeScript type definitions for MCP server instrumentation
 */

// =============================================================================
// JSON-RPC TYPES
// =============================================================================

/**
 * JSON-RPC 2.0 request object
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  id: string | number;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 notification object
 * Note: Notifications do NOT have an 'id' field - this is what distinguishes them from requests
 */
export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 response object
 */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

/**
 * JSON-RPC 2.0 error object
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * Union type for all JSON-RPC message types
 */
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

// =============================================================================
// MCP TRANSPORT TYPES
// =============================================================================

/**
 * MCP transport interface
 */
export interface MCPTransport {
  /**
   * Message handler for incoming JSON-RPC messages
   * The first argument is a JSON RPC message
   */
  onmessage?: (...args: unknown[]) => void;
  
  /**
   * Close handler for transport lifecycle
   */
  onclose?: (...args: unknown[]) => void;
  
  /**
   * Send method for outgoing messages
   */
  send?: (message: JsonRpcMessage, options?: Record<string, unknown>) => Promise<void>;
  
  /**
   * Optional session identifier
   */
  sessionId?: string;
}

/**
 * MCP server instance interface
 */
export interface MCPServerInstance {
  /**
   * Register a resource handler
   * The first arg is always a name, the last arg should always be a callback function (ie a handler).
   */
  resource: (name: string, ...args: unknown[]) => void;
  
  /**
   * Register a tool handler
   * The first arg is always a name, the last arg should always be a callback function (ie a handler).
   */
  tool: (name: string, ...args: unknown[]) => void;
  
  /**
   * Register a prompt handler
   * The first arg is always a name, the last arg should always be a callback function (ie a handler).
   */
  prompt: (name: string, ...args: unknown[]) => void;
  
  /**
   * Connect the server to a transport
   */
  connect(transport: MCPTransport): Promise<void>;
  
  /**
   * Optional server configuration
   */
  server?: {
    setRequestHandler: (schema: unknown, handler: (...args: unknown[]) => unknown) => void;
  };
}

// =============================================================================
// SPAN AND ATTRIBUTE TYPES
// =============================================================================

/**
 * Span attributes for MCP instrumentation
 */
export interface McpSpanAttributes {
  // Core MCP attributes
  'mcp.method.name': string;
  'mcp.request.id'?: string;
  'mcp.session.id'?: string;
  'mcp.transport': string;
  
  // Method-specific attributes
  'mcp.tool.name'?: string;
  'mcp.resource.uri'?: string;
  'mcp.resource.name'?: string;
  'mcp.prompt.name'?: string;
  'mcp.resource.protocol'?: string;
  
  // Notification attributes
  'mcp.notification.direction'?: 'client_to_server' | 'server_to_client';
  'mcp.cancelled.request_id'?: string;
  'mcp.cancelled.reason'?: string;
  'mcp.progress.token'?: string;
  'mcp.progress.current'?: number;
  'mcp.progress.total'?: number;
  'mcp.progress.percentage'?: number;
  'mcp.progress.message'?: string;
  'mcp.logging.level'?: string;
  'mcp.logging.logger'?: string;
  'mcp.logging.data_type'?: string;
  'mcp.logging.message'?: string;
  
  // Network attributes
  'network.transport': string;
  'network.protocol.version'?: string;
  'client.address'?: string;
  'client.port'?: number;
  
  // Error attributes
  'error.type'?: string;
  'rpc.jsonrpc.error_code'?: number;
  
  // Request arguments (dynamic keys)
  [key: `mcp.request.argument.${string}`]: string;
}

/**
 * Transport types for MCP
 */
export type McpTransportType = 'stdio' | 'sse' | 'http' | 'websocket';

/**
 * Network transport types
 */
export type NetworkTransportType = 'pipe' | 'tcp' | 'udp' | 'quic' | 'unix';

/**
 * Transport type mapping result
 */
export interface TransportTypesResult {
  mcpTransport: McpTransportType;
  networkTransport: NetworkTransportType;
}

// =============================================================================
// SESSION AND REQUEST CORRELATION TYPES
// =============================================================================

/**
 * Session identifier type
 */
export type SessionId = string;

/**
 * Request identifier type
 */
export type RequestId = string | number;

/**
 * Extra handler data with request correlation information
 */
export interface ExtraHandlerDataWithRequestId {
  sessionId: SessionId;
  requestId: RequestId;
}

/**
 * Extra data passed to message handlers
 */
export interface ExtraHandlerData {
  requestInfo?: {
    remoteAddress?: string;
    remotePort?: number;
  };
  clientAddress?: string;
  clientPort?: number;
  request?: {
    ip?: string;
    connection?: {
      remoteAddress?: string;
      remotePort?: number;
    };
  };
  sessionId?: SessionId;
  requestId?: RequestId;
}

// =============================================================================
// MCP METHOD PARAMETER TYPES
// =============================================================================

/**
 * Parameters for tools/call method
 */
export interface ToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

/**
 * Parameters for resources/read method
 */
export interface ResourceReadParams {
  uri: string;
}

/**
 * Parameters for resources/subscribe method
 */
export interface ResourceSubscribeParams {
  uri: string;
}

/**
 * Parameters for resources/unsubscribe method
 */
export interface ResourceUnsubscribeParams {
  uri: string;
}

/**
 * Parameters for prompts/get method
 */
export interface PromptGetParams {
  name: string;
  arguments?: Record<string, unknown>;
}

/**
 * Parameters for notifications/cancelled
 */
export interface NotificationCancelledParams {
  requestId: RequestId;
  reason?: string;
}

/**
 * Parameters for notifications/progress
 */
export interface NotificationProgressParams {
  progressToken: string;
  progress?: number;
  total?: number;
  message?: string;
}

/**
 * Parameters for notifications/message
 */
export interface NotificationMessageParams {
  level: string;
  logger?: string;
  data: unknown;
}

/**
 * Parameters for notifications/resources/updated
 */
export interface NotificationResourceUpdatedParams {
  uri: string;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Generic type for method parameters
 */
export type MethodParams = 
  | ToolCallParams
  | ResourceReadParams
  | ResourceSubscribeParams
  | ResourceUnsubscribeParams
  | PromptGetParams
  | NotificationCancelledParams
  | NotificationProgressParams
  | NotificationMessageParams
  | NotificationResourceUpdatedParams
  | Record<string, unknown>;

/**
 * Type guard function type
 */
export type TypeGuard<T> = (value: unknown) => value is T;

/**
 * Callback function type for instrumentation
 */
export type InstrumentationCallback<T = unknown> = () => T;

/**
 * Span creation configuration
 */
export interface SpanConfig {
  name: string;
  forceTransaction?: boolean;
  attributes: Record<string, string | number>;
}

// =============================================================================
// TRACE PROPAGATION TYPES
// =============================================================================

/**
 * Trace data for propagation
 */
export interface TraceData {
  'sentry-trace'?: string;
  baggage?: string;
  traceparent?: string; // W3C format
}

/**
 * MCP trace metadata in params._meta
 */
export interface McpTraceMetadata {
  'sentry-trace'?: string;
  baggage?: string;
  traceparent?: string; // W3C format support
}

/**
 * Request with trace metadata
 */
export interface JsonRpcRequestWithTrace extends JsonRpcRequest {
  params?: Record<string, unknown> & {
    _meta?: McpTraceMetadata;
  };
}

/**
 * Notification with trace metadata
 */
export interface JsonRpcNotificationWithTrace extends JsonRpcNotification {
  params?: Record<string, unknown> & {
    _meta?: McpTraceMetadata;
  };
}

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

/**
 * Options for MCP server instrumentation
 */
export interface McpServerInstrumentationOptions {
  /**
   * Whether to capture request arguments (security consideration)
   * Default: false
   */
  captureRequestArguments?: boolean;
  
  /**
   * Which request arguments to capture (if captureRequestArguments is true)
   * Default: [] (none)
   */
  allowedRequestArguments?: string[];
  
  /**
   * Maximum length for logging message content
   * Default: 1000
   */
  maxLoggingMessageLength?: number;
  
  /**
   * Whether to capture client information (address, port)
   * Default: true
   */
  captureClientInfo?: boolean;
  
  /**
   * Custom attribute extraction function
   */
  customAttributeExtractor?: (method: string, params: MethodParams) => Record<string, string | number>;
}

// =============================================================================
// ERROR TYPES
// =============================================================================

/**
 * MCP-specific error interface
 */
export interface McpError extends Error {
  code?: number;
  data?: unknown;
}

/**
 * Tool execution result with error flag
 */
export interface CallToolResult {
  content?: unknown;
  isError?: boolean;
  error?: string;
}

// =============================================================================
// EXPORT UTILITY TYPES
// =============================================================================

/**
 * All MCP method names as a union type
 */
export type McpMethodName = 
  | 'initialize'
  | 'ping'
  | 'tools/list'
  | 'tools/call'
  | 'resources/list'
  | 'resources/read'
  | 'resources/subscribe'
  | 'resources/unsubscribe'
  | 'resources/templates/list'
  | 'prompts/list'
  | 'prompts/get'
  | 'roots/list'
  | 'completion/complete'
  | 'sampling/createMessage'
  | 'logging/setLevel'
  | 'notifications/initialized'
  | 'notifications/cancelled'
  | 'notifications/message'
  | 'notifications/prompts/list_changed'
  | 'notifications/resources/list_changed'
  | 'notifications/resources/updated'
  | 'notifications/roots/list_changed'
  | 'notifications/tools/list_changed';

/**
 * JSON-RPC error codes as a union type
 */
export type JsonRpcErrorCode = -32700 | -32600 | -32601 | -32602 | -32603 | number; 