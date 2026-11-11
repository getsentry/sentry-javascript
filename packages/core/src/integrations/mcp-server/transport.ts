/**
 * Transport layer instrumentation for MCP server
 *
 * Handles message interception and response correlation.
 * @see https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
 */

import { MCP_AUTH_CLIENT_NAME, MCP_METHOD_NAME, MCP_PROTOCOL_VERSION } from '@sentry/conventions/attributes';
import { getClient, getIsolationScope, withIsolationScope } from '../../currentScopes';
import { DEBUG_BUILD } from '../../debug-build';
import { withActiveSpan } from '../../tracing';
import { startInactiveSpan } from '../../tracing/trace';
import type { Span } from '../../types/span';
import { getActiveSpan, spanToJSON } from '../../utils/spanUtils';
import { isObjectLike } from '../../utils/is';
import { fill } from '../../utils/object';
import { safeCallback } from '../../utils/safeCallback';
import {
  applyResponseToSpan,
  cleanupPendingSpansForTransport,
  completeSpanWithResults,
  storeSpanForRequest,
} from './correlation';
import { captureError, isJsonRpcServerError } from './errorCapture';
import { buildClientAttributesFromInfo, extractSessionDataFromInitializeRequest } from './sessionExtraction';
import { cleanupSessionDataForTransport, updateSessionDataForTransport } from './sessionManagement';
import {
  buildMcpNotificationSpanConfig,
  buildMcpServerSpanConfig,
  createMcpNotificationSpan,
  createMcpOutgoingNotificationSpan,
} from './spans';
import type {
  ExtraHandlerData,
  JsonRpcRequest,
  McpServerWrapperOptions,
  MCPTransport,
  ResolvedMcpOptions,
  SessionData,
} from './types';
import type { UpstreamOutcome } from './upstreamInstrumentation';
import { shouldHandOffToUpstream, withInboundHandoff } from './upstreamInstrumentation';
import { isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse } from './validation';

function resolveMcpOptions(options: McpServerWrapperOptions): ResolvedMcpOptions {
  if (options.recordInputs !== undefined && options.recordOutputs !== undefined) {
    return {
      recordInputs: options.recordInputs,
      recordOutputs: options.recordOutputs,
    };
  }

  const client = getClient();
  // TODO(v12): Drop the `genAI` fallback and read `client.getDataCollectionOptions().mcp`. Until then, the raw option
  // is read because the resolved `mcp` always has defaults applied and would hide whether the user set it.
  const userMcp = client?.getOptions().dataCollection?.mcp;
  const genAI = client?.getDataCollectionOptions().genAI;

  return {
    recordInputs: options.recordInputs ?? userMcp?.inputs ?? genAI?.inputs ?? true,
    recordOutputs: options.recordOutputs ?? userMcp?.outputs ?? genAI?.outputs ?? true,
  };
}

/** Resolves only the OAuth client name; optional telemetry must not interrupt MCP dispatch. */
function resolveOAuthClientName(options: McpServerWrapperOptions, extra?: ExtraHandlerData): string | undefined {
  if (!options.getOAuthClientName) {
    return undefined;
  }

  const name = safeCallback(
    DEBUG_BUILD ? 'The `getOAuthClientName` callback threw an error:' : '',
    () => {
      const authInfo = extra?.authInfo;
      return options.getOAuthClientName?.(
        authInfo ? { clientId: authInfo.clientId, extra: authInfo.extra } : undefined,
      );
    },
    () => undefined,
  );
  return typeof name === 'string' && name ? name : undefined;
}

/**
 * Wraps transport.onmessage to create spans for incoming messages.
 * Stores client info and protocol version only for legacy initialize requests.
 * Modern request metadata is read directly when building each message's span.
 * @param transport - MCP transport instance to wrap
 * @param options - MCP instrumentation options
 * @param serverInstance - The MCP server the transport is connected to
 */
export function wrapTransportOnMessage(
  transport: MCPTransport,
  options: McpServerWrapperOptions,
  serverInstance?: object,
): void {
  if (transport.onmessage) {
    fill(transport, 'onmessage', originalOnMessage => {
      return function (this: MCPTransport, message: unknown, extra?: unknown) {
        const request = isJsonRpcRequest(message) ? message : undefined;
        const notification = isJsonRpcNotification(message) ? message : undefined;
        let messageSessionData: SessionData | undefined;

        if (request?.method === 'initialize') {
          try {
            messageSessionData = extractSessionDataFromInitializeRequest(request);
            if (messageSessionData.protocolVersion || messageSessionData.clientInfo) {
              updateSessionDataForTransport(transport, messageSessionData);
            }
          } catch {
            // noop
          }
        }

        if (request) {
          const resolvedOptions = resolveMcpOptions(options);
          const isolationScope = getIsolationScope().clone();

          return withIsolationScope(isolationScope, () => {
            const spanConfig = buildMcpServerSpanConfig(request, transport, extra as ExtraHandlerData, resolvedOptions);
            const oauthClientName = resolveOAuthClientName(options, extra as ExtraHandlerData);
            if (oauthClientName) {
              spanConfig.attributes[MCP_AUTH_CLIENT_NAME] = oauthClientName;
            }
            const sessionAttributes =
              request.method === 'initialize' && messageSessionData
                ? {
                    ...buildClientAttributesFromInfo(messageSessionData.clientInfo),
                    ...(messageSessionData.protocolVersion && {
                      [MCP_PROTOCOL_VERSION]: messageSessionData.protocolVersion,
                    }),
                  }
                : undefined;

            const startRequestSpan = (): Span => {
              const span = startInactiveSpan(spanConfig);
              if (sessionAttributes) {
                span.setAttributes(sessionAttributes);
              }
              storeSpanForRequest(transport, request.id, span, request.method, resolvedOptions);
              return span;
            };

            const callOriginal = (): unknown =>
              (originalOnMessage as (...args: unknown[]) => unknown).call(this, request, extra);

            if (shouldHandOffToUpstream(serverInstance)) {
              return withInboundHandoff(
                {
                  method: request.method,
                  id: request.id,
                  adopt: span => {
                    span.setAttributes({ ...spanConfig.attributes, ...sessionAttributes });
                    return outcome => applyUpstreamOutcome(transport, span, request, outcome, resolvedOptions);
                  },
                  runInOwnSpan: fn => withActiveSpan(startRequestSpan(), fn),
                },
                callOriginal,
              );
            }

            return withActiveSpan(startRequestSpan(), callOriginal);
          });
        }

        if (notification) {
          const resolvedOptions = resolveMcpOptions(options);
          const callOriginal = (): unknown =>
            (originalOnMessage as (...args: unknown[]) => unknown).call(this, notification, extra);

          if (shouldHandOffToUpstream(serverInstance)) {
            return withInboundHandoff(
              {
                method: notification.method,
                adopt: span => {
                  span.setAttributes(
                    buildMcpNotificationSpanConfig(
                      'notification-incoming',
                      notification,
                      transport,
                      resolvedOptions,
                      extra as ExtraHandlerData,
                    ).attributes,
                  );
                },
                runInOwnSpan: fn =>
                  createMcpNotificationSpan(
                    notification,
                    transport,
                    extra as ExtraHandlerData,
                    resolvedOptions,
                    fn,
                  ) as ReturnType<typeof fn>,
              },
              callOriginal,
            );
          }

          return createMcpNotificationSpan(
            notification,
            transport,
            extra as ExtraHandlerData,
            resolvedOptions,
            callOriginal,
          );
        }

        return (originalOnMessage as (...args: unknown[]) => unknown).call(this, message, extra);
      };
    });
  }
}

/** Records the response on the MCP SDK's span before the SDK ends it. */
function applyUpstreamOutcome(
  transport: MCPTransport,
  span: Span,
  request: JsonRpcRequest,
  outcome: UpstreamOutcome,
  capturePolicy: ResolvedMcpOptions,
): void {
  if (outcome.type === 'result' && 'result' in outcome) {
    applyResponseToSpan(transport, span, request.method, outcome.result, undefined, capturePolicy);
  } else if (outcome.type === 'error' && 'error' in outcome) {
    applyResponseToSpan(transport, span, request.method, undefined, outcome.error, capturePolicy);
  }
}

/**
 * Wraps transport.send to handle outgoing messages and response correlation.
 * Caches legacy initialize metadata and applies modern result metadata only to
 * the corresponding request span.
 * @param transport - MCP transport instance to wrap
 * @param options - MCP capture overrides
 * @param serverInstance - The MCP server the transport is connected to
 */
export function wrapTransportSend(
  transport: MCPTransport,
  options: McpServerWrapperOptions,
  serverInstance?: object,
): void {
  if (transport.send) {
    fill(transport, 'send', originalSend => {
      return async function (this: MCPTransport, ...args: unknown[]) {
        const [message] = args;

        if (isJsonRpcNotification(message)) {
          const resolvedOptions = resolveMcpOptions(options);
          // The MCP SDK sends a notification inside its own scope, so its span is the active one.
          const upstreamSpan = shouldHandOffToUpstream(serverInstance) ? getActiveSpan() : undefined;
          if (upstreamSpan && spanToJSON(upstreamSpan).attributes[MCP_METHOD_NAME] === message.method) {
            upstreamSpan.setAttributes(
              buildMcpNotificationSpanConfig('notification-outgoing', message, transport, resolvedOptions).attributes,
            );
            return (originalSend as (...args: unknown[]) => unknown).call(this, ...args);
          }
          return createMcpOutgoingNotificationSpan(message, transport, resolvedOptions, () => {
            return (originalSend as (...args: unknown[]) => unknown).call(this, ...args);
          });
        }

        if (isJsonRpcResponse(message)) {
          if (message.id !== null && message.id !== undefined) {
            if (message.error) {
              captureJsonRpcErrorResponse(message.error);
            }

            completeSpanWithResults(transport, message.id, message.result, message.error);
          }
        }

        return (originalSend as (...args: unknown[]) => unknown).call(this, ...args);
      };
    });
  }
}

/**
 * Wraps transport.onclose to clean up pending spans for this transport only
 * @param transport - MCP transport instance to wrap
 */
export function wrapTransportOnClose(transport: MCPTransport): void {
  if (transport.onclose) {
    fill(transport, 'onclose', originalOnClose => {
      return function (this: MCPTransport, ...args: unknown[]) {
        cleanupPendingSpansForTransport(transport);
        cleanupSessionDataForTransport(transport);
        return (originalOnClose as (...args: unknown[]) => unknown).call(this, ...args);
      };
    });
  }
}

/**
 * Wraps transport error handlers to capture connection errors
 * @param transport - MCP transport instance to wrap
 */
export function wrapTransportError(transport: MCPTransport): void {
  if (transport.onerror) {
    fill(transport, 'onerror', (originalOnError: (error: Error) => void) => {
      return function (this: MCPTransport, error: Error) {
        captureTransportError(error);
        return originalOnError.call(this, error);
      };
    });
  }
}

/**
 * Captures JSON-RPC error responses for server-side errors.
 * @see https://www.jsonrpc.org/specification#error_object
 * @internal
 * @param errorResponse - JSON-RPC error response
 */
function captureJsonRpcErrorResponse(errorResponse: unknown): void {
  try {
    if (isObjectLike(errorResponse) && 'code' in errorResponse && 'message' in errorResponse) {
      const jsonRpcError = errorResponse as { code: number; message: string; data?: unknown };

      if (typeof jsonRpcError.code === 'number' && isJsonRpcServerError(jsonRpcError.code)) {
        const error = new Error(jsonRpcError.message);
        error.name = `JsonRpcError_${jsonRpcError.code}`;

        captureError(error, 'protocol');
      }
    }
  } catch {
    // noop
  }
}

/**
 * Captures transport connection errors
 * @internal
 * @param error - Transport error
 */
function captureTransportError(error: Error): void {
  try {
    captureError(error, 'transport');
  } catch {
    // noop
  }
}
