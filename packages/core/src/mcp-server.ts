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

  // eslint-disable-next-line @typescript-eslint/unbound-method
  mcpServerInstance.connect = new Proxy(mcpServerInstance.connect, {
    apply(target, thisArg, argArray) {
      const [transport, ...restArgs] = argArray as [MCPTransport, ...unknown[]];

      if (!transport.onclose) {
        transport.onclose = () => {
          if (transport.sessionId) {
            handleTransportOnClose(transport.sessionId);
          }
        };
      }

      if (!transport.onmessage) {
        transport.onmessage = jsonRpcMessage => {
          if (transport.sessionId && isJsonRPCMessageWithRequestId(jsonRpcMessage)) {
            handleTransportOnMessage(transport.sessionId, jsonRpcMessage.id);
          }
        };
      }

      const patchedTransport = new Proxy(transport, {
        set(target, key, value) {
          if (key === 'onmessage') {
            target[key] = new Proxy(value, {
              apply(onMessageTarget, onMessageThisArg, onMessageArgArray) {
                const [jsonRpcMessage] = onMessageArgArray;
                if (transport.sessionId && isJsonRPCMessageWithRequestId(jsonRpcMessage)) {
                  handleTransportOnMessage(transport.sessionId, jsonRpcMessage.id);
                }
                return Reflect.apply(onMessageTarget, onMessageThisArg, onMessageArgArray);
              },
            });
          } else if (key === 'onclose') {
            target[key] = new Proxy(value, {
              apply(onCloseTarget, onCloseThisArg, onCloseArgArray) {
                if (transport.sessionId) {
                  handleTransportOnClose(transport.sessionId);
                }
                return Reflect.apply(onCloseTarget, onCloseThisArg, onCloseArgArray);
              },
            });
          } else {
            target[key as keyof MCPTransport] = value;
          }
          return true;
        },
      });

      return Reflect.apply(target, thisArg, [patchedTransport, ...restArgs]);
    },
  });

  mcpServerInstance.resource = new Proxy(mcpServerInstance.resource, {
    apply(target, thisArg, argArray) {
      const resourceName: unknown = argArray[0];
      const resourceHandler: unknown = argArray[argArray.length - 1];

      if (typeof resourceName !== 'string' || typeof resourceHandler !== 'function') {
        return target.apply(thisArg, argArray);
      }

      const wrappedResourceHandler = new Proxy(resourceHandler, {
        apply(resourceHandlerTarget, resourceHandlerThisArg, resourceHandlerArgArray) {
          const extraHandlerDataWithRequestId = resourceHandlerArgArray.find(isExtraHandlerDataWithRequestId);
          return associateContextWithRequestSpan(extraHandlerDataWithRequestId, () => {
            return startSpan(
              {
                name: `mcp-server/resource:${resourceName}`,
                forceTransaction: true,
                attributes: {
                  [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'auto.function.mcp-server',
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.mcp-server',
                  [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
                  'mcp_server.resource': resourceName,
                },
              },
              () => resourceHandlerTarget.apply(resourceHandlerThisArg, resourceHandlerArgArray),
            );
          });
        },
      });

      return Reflect.apply(target, thisArg, [...argArray.slice(0, -1), wrappedResourceHandler]);
    },
  });

  mcpServerInstance.tool = new Proxy(mcpServerInstance.tool, {
    apply(target, thisArg, argArray) {
      const toolName: unknown = argArray[0];
      const toolHandler: unknown = argArray[argArray.length - 1];

      if (typeof toolName !== 'string' || typeof toolHandler !== 'function') {
        return target.apply(thisArg, argArray);
      }

      const wrappedToolHandler = new Proxy(toolHandler, {
        apply(toolHandlerTarget, toolHandlerThisArg, toolHandlerArgArray) {
          const extraHandlerDataWithRequestId = toolHandlerArgArray.find(isExtraHandlerDataWithRequestId);
          return associateContextWithRequestSpan(extraHandlerDataWithRequestId, () => {
            return startSpan(
              {
                name: `mcp-server/tool:${toolName}`,
                forceTransaction: true,
                attributes: {
                  [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'auto.function.mcp-server',
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.mcp-server',
                  [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
                  'mcp_server.tool': toolName,
                },
              },
              () => toolHandlerTarget.apply(toolHandlerThisArg, toolHandlerArgArray),
            );
          });
        },
      });

      return Reflect.apply(target, thisArg, [...argArray.slice(0, -1), wrappedToolHandler]);
    },
  });

  mcpServerInstance.prompt = new Proxy(mcpServerInstance.prompt, {
    apply(target, thisArg, argArray) {
      const promptName: unknown = argArray[0];
      const promptHandler: unknown = argArray[argArray.length - 1];

      if (typeof promptName !== 'string' || typeof promptHandler !== 'function') {
        return target.apply(thisArg, argArray);
      }

      const wrappedPromptHandler = new Proxy(promptHandler, {
        apply(promptHandlerTarget, promptHandlerThisArg, promptHandlerArgArray) {
          const extraHandlerDataWithRequestId = promptHandlerArgArray.find(isExtraHandlerDataWithRequestId);
          return associateContextWithRequestSpan(extraHandlerDataWithRequestId, () => {
            return startSpan(
              {
                name: `mcp-server/prompt:${promptName}`,
                forceTransaction: true,
                attributes: {
                  [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'auto.function.mcp-server',
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.mcp-server',
                  [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
                  'mcp_server.prompt': promptName,
                },
              },
              () => promptHandlerTarget.apply(promptHandlerThisArg, promptHandlerArgArray),
            );
          });
        },
      });

      return Reflect.apply(target, thisArg, [...argArray.slice(0, -1), wrappedPromptHandler]);
    },
  });

  wrappedMcpServerInstances.add(mcpServerInstance);

  return mcpServerInstance as S;
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
    typeof mcpServerInstance.connect === 'function'
  );
}

function isJsonRPCMessageWithRequestId(target: unknown): target is { id: RequestId } {
  return (
    typeof target === 'object' &&
    target !== null &&
    'id' in target &&
    (typeof target.id === 'number' || typeof target.id === 'string')
  );
}

interface ExtraHandlerDataWithRequestId {
  sessionId: SessionId;
  requestId: RequestId;
}

// Note that not all versions of the MCP library have `requestId` as a field on the extra data.
function isExtraHandlerDataWithRequestId(target: unknown): target is ExtraHandlerDataWithRequestId {
  return (
    typeof target === 'object' &&
    target !== null &&
    'sessionId' in target &&
    typeof target.sessionId === 'string' &&
    'requestId' in target &&
    (typeof target.requestId === 'number' || typeof target.requestId === 'string')
  );
}

type SessionId = string;
type RequestId = string | number;

const sessionAndRequestToRequestParentSpanMap = new Map<SessionId, Map<RequestId, Span>>();

function handleTransportOnClose(sessionId: SessionId): void {
  sessionAndRequestToRequestParentSpanMap.delete(sessionId);
}

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
