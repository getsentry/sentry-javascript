import type { Span } from '../../types-hoist/span';

/** Types for MCP server instrumentation */

/**
 * Configuration for extracting attributes from MCP methods
 * @internal
 */
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
 * @see https://www.jsonrpc.org/specification#request_object
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  id: string | number;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 response object
 * @see https://www.jsonrpc.org/specification#response_object
 */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

/**
 * JSON-RPC 2.0 error object
 * @see https://www.jsonrpc.org/specification#error_object
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * JSON-RPC 2.0 notification object
 * @note Notifications do NOT have an 'id' field - this is what distinguishes them from requests
 * @see https://www.jsonrpc.org/specification#notification
 */
export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

/**
 * MCP transport interface
 * @description Abstraction for MCP communication transport layer
 */
export interface MCPTransport {
  /**
   * Message handler for incoming JSON-RPC messages
   * The first argument is a JSON RPC message
   */
  onmessage?: (...args: unknown[]) => void;

  /** Close handler for transport lifecycle */
  onclose?: (...args: unknown[]) => void;

  /** Error handler for transport errors */
  onerror?: (error: Error) => void;

  /** Send method for outgoing messages */
  send?: (message: JsonRpcMessage, options?: Record<string, unknown>) => Promise<void>;

  /** Optional session identifier */
  sessionId?: SessionId;
}

/** Union type for all JSON-RPC message types */
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

/**
 * MCP server instance interface
 * @description MCP server methods for registering handlers
 */
export interface MCPServerInstance {
  /** Register a resource handler */
  resource: (name: string, ...args: unknown[]) => void;

  /** Register a tool handler */
  tool: (name: string, ...args: unknown[]) => void;

  /** Register a prompt handler */
  prompt: (name: string, ...args: unknown[]) => void;

  /** Connect the server to a transport */
  connect(transport: MCPTransport): Promise<void>;
}

/** Client connection information for handlers */
export interface ExtraHandlerData {
  requestInfo?: { remoteAddress?: string; remotePort?: number };
  clientAddress?: string;
  clientPort?: number;
  request?: {
    ip?: string;
    connection?: { remoteAddress?: string; remotePort?: number };
  };
}

/** Types of MCP spans */
export type McpSpanType = 'request' | 'notification-incoming' | 'notification-outgoing';

/**
 * Configuration for creating MCP spans
 * @internal
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

/**
 * Request-to-span correlation data
 * @internal
 */
export type RequestSpanMapValue = {
  span: Span;
  method: string;
  startTime: number;
};

/** Generic MCP handler function */
export type MCPHandler = (...args: unknown[]) => unknown;

/**
 * Extra data passed to MCP handlers
 * @internal
 */
export interface HandlerExtraData {
  sessionId?: SessionId;
  requestId: RequestId;
}

/** Error types for MCP operations */
export type McpErrorType =
  | 'tool_execution'
  | 'resource_execution'
  | 'prompt_execution'
  | 'transport'
  | 'protocol'
  | 'validation'
  | 'timeout';

/**
 * Party (client/server) information extracted from MCP initialize requests
 * @internal
 */
export type PartyInfo = {
  name?: string;
  title?: string;
  version?: string;
};

/**
 * Session-level data collected from various MCP messages
 * @internal
 */
export type SessionData = {
  clientInfo?: PartyInfo;
  protocolVersion?: string;
  serverInfo?: PartyInfo;
};
