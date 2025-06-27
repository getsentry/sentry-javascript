import { DEBUG_BUILD } from './debug-build';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from './semanticAttributes';
import { startSpan, withActiveSpan } from './tracing';
import type { Span } from './types-hoist/span';
import { logger } from './utils/logger';
import { getActiveSpan } from './utils/spanUtils';

interface MCPTransport {
  // The first argument is a JSON RPC message
  onmessage?: (...args: unknown[]) => void;
  onclose?: (...args: unknown[]) => void;
  sessionId?: string;
}

interface MCPServerInstance {
  // The first arg is always a name, the last arg should always be a callback function (ie a handler).
  // TODO: We could also make use of the resource uri argument somehow.
  resource: (name: string, ...args: unknown[]) => void;
  // The first arg is always a name, the last arg should always be a callback function (ie a handler).
  tool: (name: string, ...args: unknown[]) => void;
  // The first arg is always a name, the last arg should always be a callback function (ie a handler).
  prompt: (name: string, ...args: unknown[]) => void;
  connect(transport: MCPTransport): Promise<void>;
  server?: {
    setRequestHandler: (schema: unknown, handler: (...args: unknown[]) => unknown) => void;
  };
}

const wrappedMcpServerInstances = new WeakSet();

/**
 * Wraps a MCP Server instance from the `@modelcontextprotocol/sdk` package with Sentry instrumentation.
 *
 * Compatible with versions `^1.9.0` of the `@modelcontextprotocol/sdk` package.
 */
// We are exposing this API for non-node runtimes that cannot rely on auto-instrumentation.
export function wrapMcpServerWithSentry<S extends object>(mcpServerInstance: S): S {
  if (wrappedMcpServerInstances.has(mcpServerInstance)) {
    return mcpServerInstance;
  }

  if (!isMcpServerInstance(mcpServerInstance)) {
    DEBUG_BUILD && logger.warn('Did not patch MCP server. Interface is incompatible.');
    return mcpServerInstance;
  }

  // Wrap connect() to intercept AFTER Protocol sets up transport handlers
  mcpServerInstance.connect = new Proxy(mcpServerInstance.connect, {
    async apply(target, thisArg, argArray) {
      const [transport, ...restArgs] = argArray as [MCPTransport, ...unknown[]];

      // Call the original connect first to let Protocol set up its handlers
      const result = await Reflect.apply(target, thisArg, [transport, ...restArgs]);
      
      
      // NOW intercept the transport's onmessage after Protocol has set it up
      if (transport.onmessage) {
        const protocolOnMessage = transport.onmessage;
        
        transport.onmessage = new Proxy(protocolOnMessage, {
          apply(onMessageTarget, onMessageThisArg, onMessageArgs) {
            const [jsonRpcMessage, extra] = onMessageArgs;
            

            // TODO(bete): Instrument responses/notifications (not sure if they are RPC)
            if (isJsonRpcRequest(jsonRpcMessage)) {
              return createMcpServerSpan(jsonRpcMessage, transport, extra, () => {
                return onMessageTarget.apply(onMessageThisArg, onMessageArgs);
              });
            }
            
            return onMessageTarget.apply(onMessageThisArg, onMessageArgs);
          }
        });
      } 

      // Handle transport lifecycle events
      if (transport.onclose) {
        const originalOnClose = transport.onclose;
        transport.onclose = new Proxy(originalOnClose, {
          apply(onCloseTarget, onCloseThisArg, onCloseArgs) {
            if (transport.sessionId) {
              handleTransportOnClose(transport.sessionId);
            }
            return onCloseTarget.apply(onCloseThisArg, onCloseArgs);
          }
        });
      }
      return result;
    },
  });

  wrappedMcpServerInstances.add(mcpServerInstance);
  return mcpServerInstance as S;
}

function createMcpServerSpan(
  jsonRpcMessage: JsonRpcRequest,
  transport: MCPTransport,
  extra: any,
  callback: () => any
) {
  const { method, id: requestId, params } = jsonRpcMessage;
  
  // Extract target from method and params for proper description
  const target = extractTarget(method, params);
  const description = target ? `${method} ${target}` : method;

  // Session ID should come from the transport itself, not the RPC message
  const sessionId = transport.sessionId;
  
  // Extract client information from extra/request data
  const clientAddress = extra?.requestInfo?.remoteAddress || 
                       extra?.clientAddress ||
                       extra?.request?.ip ||
                       extra?.request?.connection?.remoteAddress;
  const clientPort = extra?.requestInfo?.remotePort || 
                    extra?.clientPort ||
                    extra?.request?.connection?.remotePort;

  // Determine transport types
  const { mcpTransport, networkTransport } = getTransportTypes(transport);

  const attributes: Record<string, string | number> = {
    'mcp.method.name': method,
    
    ...(requestId !== undefined && { 'mcp.request.id': String(requestId) }),
    ...(target && getTargetAttributes(method, target)),
    ...(sessionId && { 'mcp.session.id': sessionId }),
    ...(clientAddress && { 'client.address': clientAddress }),
    ...(clientPort && { 'client.port': clientPort }),
    'mcp.transport': mcpTransport,           // Application level: "http", "sse", "stdio", "websocket"
    'network.transport': networkTransport,   // Network level: "tcp", "pipe", "udp", "quic"
    'network.protocol.version': '2.0',       // JSON-RPC version
    
    // Opt-in: Tool arguments (if enabled)
    ...getRequestArguments(method, params),
    
    // Sentry-specific attributes
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'mcp.server',
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.mcp_server',
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route'
  };

  return startSpan({
    name: description,
    forceTransaction: true,
    attributes
  }, () => {
    return callback();
  });
}

function extractTarget(method: string, params: any): string | undefined {
  switch (method) {
    case 'tools/call':
      return params?.name;  // Tool name
    case 'resources/read':
    case 'resources/subscribe':
    case 'resources/unsubscribe':
      return params?.uri;   // Resource URI
    case 'prompts/get':
      return params?.name;  // Prompt name
    default:
      return undefined;
  }
}

function getTargetAttributes(method: string, target: string): Record<string, string> {
  switch (method) {
    case 'tools/call':
      return { 'mcp.tool.name': target };
    case 'resources/read':
    case 'resources/subscribe':
    case 'resources/unsubscribe':
      return { 'mcp.resource.uri': target };
    case 'prompts/get':
      return { 'mcp.prompt.name': target };
    default:
      return {};
  }
}

function getTransportTypes(transport: MCPTransport): { mcpTransport: string; networkTransport: string } {
  // Try to determine transport type from transport properties/constructor
  const transportName = transport.constructor?.name?.toLowerCase() || '';
  
  if (transportName.includes('sse')) {
    return { mcpTransport: 'sse', networkTransport: 'tcp' };
  }
  if (transportName.includes('http')) {
    return { mcpTransport: 'http', networkTransport: 'tcp' };
  }
  if (transportName.includes('websocket') || transportName.includes('ws')) {
    return { mcpTransport: 'websocket', networkTransport: 'tcp' };
  }
  if (transportName.includes('stdio')) {
    return { mcpTransport: 'stdio', networkTransport: 'pipe' };
  }
  
  // Default assumption based on your setup (HTTP server)
  return { mcpTransport: 'http', networkTransport: 'tcp' };
}
function getRequestArguments(method: string, params: any): Record<string, string> {
  const args: Record<string, string> = {};
  
  // Only include arguments for certain methods (security consideration)
  switch (method) {
    case 'tools/call':
      if (params?.arguments) {
        // Convert arguments to JSON strings as per MCP conventions
        for (const [key, value] of Object.entries(params.arguments)) {
          args[`mcp.request.argument.${key.toLowerCase()}`] = JSON.stringify(value);
        }
      }
      break;
    case 'resources/read':
      if (params?.uri) {
        args['mcp.request.argument.uri'] = JSON.stringify(params.uri);
      }
      break;
    case 'prompts/get':
      if (params?.name) {
        args['mcp.request.argument.name'] = JSON.stringify(params.name);
      }
      if (params?.arguments) {
        for (const [key, value] of Object.entries(params.arguments)) {
          args[`mcp.request.argument.${key.toLowerCase()}`] = JSON.stringify(value);
        }
      }
      break;
  }
  
  return args;
}

function isJsonRpcRequest(message: any): message is JsonRpcRequest {
  const isRequest = (
    typeof message === 'object' &&
    message !== null &&
    message.jsonrpc === '2.0' &&
    'method' in message &&
    'id' in message
  );
  
  return isRequest;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  id: string | number;
  params?: any;
}

function isMcpServerInstance(mcpServerInstance: unknown): mcpServerInstance is MCPServerInstance {
  return (
    typeof mcpServerInstance === 'object' &&
    mcpServerInstance !== null &&
    'resource' in mcpServerInstance &&
    typeof mcpServerInstance.resource === 'function' &&
    'tool' in mcpServerInstance &&
    typeof mcpServerInstance.tool === 'function' &&
    'prompt' in mcpServerInstance &&
    typeof mcpServerInstance.prompt === 'function' &&
    'connect' in mcpServerInstance &&
    typeof mcpServerInstance.connect === 'function' &&
    'server' in mcpServerInstance &&
    typeof mcpServerInstance.server === 'object' &&
    mcpServerInstance.server !== null &&
    'setRequestHandler' in mcpServerInstance.server &&
    typeof mcpServerInstance.server.setRequestHandler === 'function'
  );
}


interface ExtraHandlerDataWithRequestId {
  sessionId: SessionId;
  requestId: RequestId;
}


type SessionId = string;
type RequestId = string | number;

const sessionAndRequestToRequestParentSpanMap = new Map<SessionId, Map<RequestId, Span>>();

function handleTransportOnClose(sessionId: SessionId): void {
  sessionAndRequestToRequestParentSpanMap.delete(sessionId);
}

// TODO(bete): refactor this and associateContextWithRequestSpan to use the new span API.
function handleTransportOnMessage(sessionId: SessionId, requestId: RequestId): void {
  const activeSpan = getActiveSpan();
  if (activeSpan) {
    const requestIdToSpanMap = sessionAndRequestToRequestParentSpanMap.get(sessionId) ?? new Map();
    requestIdToSpanMap.set(requestId, activeSpan);
    sessionAndRequestToRequestParentSpanMap.set(sessionId, requestIdToSpanMap);
  }
}

function associateContextWithRequestSpan<T>(
  extraHandlerData: ExtraHandlerDataWithRequestId | undefined,
  cb: () => T,
): T {
  if (extraHandlerData) {
    const { sessionId, requestId } = extraHandlerData;
    const requestIdSpanMap = sessionAndRequestToRequestParentSpanMap.get(sessionId);

    if (!requestIdSpanMap) {
      return cb();
    }

    const span = requestIdSpanMap.get(requestId);
    if (!span) {
      return cb();
    }

    // remove the span from the map so it can be garbage collected
    requestIdSpanMap.delete(requestId);
    return withActiveSpan(span, () => {
      return cb();
    });
  }

  return cb();
}
