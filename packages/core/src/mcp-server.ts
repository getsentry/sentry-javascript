import { DEBUG_BUILD } from './debug-build';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from './semanticAttributes';
import { startSpan } from './tracing';
import { logger } from './utils-hoist';

interface MCPServerInstance {
  // The first arg is always a name, the last arg should always be a callback function (ie a handler).
  // TODO: We could also make use of the resource uri argument somehow.
  resource: (name: string, ...args: unknown[]) => void;
  // The first arg is always a name, the last arg should always be a callback function (ie a handler).
  tool: (name: string, ...args: unknown[]) => void;
  // The first arg is always a name, the last arg should always be a callback function (ie a handler).
  prompt: (name: string, ...args: unknown[]) => void;
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

  mcpServerInstance.resource = new Proxy(mcpServerInstance.resource, {
    apply(target, thisArg, argArray) {
      const resourceName: unknown = argArray[0];
      const resourceHandler: unknown = argArray[argArray.length - 1];

      if (typeof resourceName !== 'string' || typeof resourceHandler !== 'function') {
        return target.apply(thisArg, argArray);
      }

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
        () => target.apply(thisArg, argArray),
      );
    },
  });

  mcpServerInstance.tool = new Proxy(mcpServerInstance.tool, {
    apply(target, thisArg, argArray) {
      const toolName: unknown = argArray[0];
      const toolHandler: unknown = argArray[argArray.length - 1];

      if (typeof toolName !== 'string' || typeof toolHandler !== 'function') {
        return target.apply(thisArg, argArray);
      }

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
        () => target.apply(thisArg, argArray),
      );
    },
  });

  mcpServerInstance.prompt = new Proxy(mcpServerInstance.prompt, {
    apply(target, thisArg, argArray) {
      const promptName: unknown = argArray[0];
      const promptHandler: unknown = argArray[argArray.length - 1];

      if (typeof promptName !== 'string' || typeof promptHandler !== 'function') {
        return target.apply(thisArg, argArray);
      }

      return startSpan(
        {
          name: `mcp-server/resource:${promptName}`,
          forceTransaction: true,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'auto.function.mcp-server',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.mcp-server',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
            'mcp_server.prompt': promptName,
          },
        },
        () => target.apply(thisArg, argArray),
      );
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
    typeof mcpServerInstance.prompt === 'function'
  );
}
