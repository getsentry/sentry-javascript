/**
 * types for MCP server instrumentation
 */

/** Method configuration type */
export type MethodConfig = {
  targetField: string;
  targetAttribute: string;
  captureArguments?: boolean;
  argumentsField?: string;
  captureUri?: boolean;
  captureName?: boolean;
};

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
 * JSON-RPC 2.0 notification object
 * Note: Notifications do NOT have an 'id' field - this is what distinguishes them from requests
 */
export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

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
 * Union type for all JSON-RPC message types
 */
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

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
}

export interface ExtraHandlerData {
  requestInfo?: { remoteAddress?: string; remotePort?: number };
  clientAddress?: string;
  clientPort?: number;
  request?: {
    ip?: string;
    connection?: { remoteAddress?: string; remotePort?: number };
  };
}

/**
 * Types of MCP spans that can be created
 */
export type McpSpanType = 'request' | 'notification-incoming' | 'notification-outgoing';

/**
 * Configuration for creating MCP spans
 */
export interface McpSpanConfig {
  type: McpSpanType;
  message: JsonRpcRequest | JsonRpcNotification;
  transport: MCPTransport;
  extra?: ExtraHandlerData;
  callback: () => unknown;
}

export type SessionId = string;
export type RequestId = string | number;
export type MCPHandler = (...args: unknown[]) => unknown;
export interface HandlerExtraData {
  sessionId?: SessionId;
  requestId: RequestId;
}