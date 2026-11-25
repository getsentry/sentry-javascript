/**
 * Transport layer instrumentation for MCP server
 *
 * Handles message interception and response correlation.
 * @see https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
 */

import { MCP_AUTH_CLIENT_NAME, MCP_METHOD_NAME, MCP_PROTOCOL_VERSION } from '@sentry/conventions/attributes';
import { getClient, getIsolationScope, withIsolationScope } from '../../currentScopes';
import { DEBUG_BUILD } from '../../debug-build';
import { startInactiveSpan, startSpanManual } from '../../tracing/trace';
import type { Span } from '../../types/span';
import { getActiveSpan, spanToJSON } from '../../utils/spanUtils';
import { fill } from '../../utils/object';
import { safeCallback } from '../../utils/safeCallback';
import {
  applyResponseToSpan,
  cleanupPendingSpansForTransport,
  completeSpanWithResults,
  storeSpanForRequest,
} from './correlation';
import { captureError } from './errorCapture';
import { buildClientAttributesFromInfo, extractSessionDataFromInitializeRequest } from './sessionExtraction';
import { cleanupSessionDataForTransport, updateSessionDataForTransport } from './sessionManagement';
import {
  buildMcpNotificationSpanConfig,
  buildMcpServerSpanConfig,
  createMcpOutgoingNotificationSpan,
  startInactiveMcpNotificationSpan,
  startMcpNotificationSpan,
} from './spans';
import { continueMcpTrace, injectMcpTraceContext } from './tracePropagation';
import type { ExtraHandlerData, McpServerWrapperOptions, MCPTransport, ResolvedMcpOptions, SessionData } from './types';
import { withUpstreamSpanHandoff } from './upstreamInstrumentation';
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
 * @param hasUpstreamInstrumentation - Whether the MCP SDK may start its own span (see `upstreamInstrumentation.ts`)
 */
export function wrapTransportOnMessage(
  transport: MCPTransport,
  options: McpServerWrapperOptions,
  hasUpstreamInstrumentation = false,
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

          return withIsolationScope(isolationScope, () =>
            continueMcpTrace(request.params, links => {
              const spanConfig = {
                ...buildMcpServerSpanConfig(request, transport, extra as ExtraHandlerData, resolvedOptions),
                links,
              };
              const oauthClientName = resolveOAuthClientName(options, extra as ExtraHandlerData);
              if (oauthClientName) {
                spanConfig.attributes[MCP_AUTH_CLIENT_NAME] = oauthClientName;
              }
              if (request.method === 'initialize' && messageSessionData) {
                Object.assign(spanConfig.attributes, buildClientAttributesFromInfo(messageSessionData.clientInfo));
                if (messageSessionData.protocolVersion) {
                  spanConfig.attributes[MCP_PROTOCOL_VERSION] = messageSessionData.protocolVersion;
                }
              }
              const callOriginal = (): unknown =>
                (originalOnMessage as (...args: unknown[]) => unknown).call(this, request, extra);
              // Ended in `transport.send` once the response goes out.
              const startRequestSpan = (): Span => {
                const span = startInactiveSpan(spanConfig);
                storeSpanForRequest(transport, request.id, span, request.method, resolvedOptions);
                return span;
              };

              // Whether the MCP SDK's span or `startRequestSpan` is used is decided once the SDK calls `receive`.
              if (hasUpstreamInstrumentation) {
                return withUpstreamSpanHandoff(
                  {
                    method: request.method,
                    id: request.id,
                    attributes: spanConfig.attributes,
                    links: spanConfig.links,
                    onResponse: (span, result, error) =>
                      applyResponseToSpan(transport, span, request.method, result, error, resolvedOptions),
                    startFallbackSpan: startRequestSpan,
                  },
                  callOriginal,
                );
              }

              return startSpanManual(spanConfig, span => {
                storeSpanForRequest(transport, request.id, span, request.method, resolvedOptions);
                return callOriginal();
              });
            }),
          );
        }

        if (notification) {
          const resolvedOptions = resolveMcpOptions(options);
          const callOriginal = (): unknown =>
            (originalOnMessage as (...args: unknown[]) => unknown).call(this, notification, extra);
          return continueMcpTrace(notification.params, links => {
            const spanConfig = {
              ...buildMcpNotificationSpanConfig(
                'notification-incoming',
                notification,
                transport,
                resolvedOptions,
                extra as ExtraHandlerData,
              ),
              links,
            };

            if (hasUpstreamInstrumentation) {
              return withUpstreamSpanHandoff(
                {
                  method: notification.method,
                  attributes: spanConfig.attributes,
                  links: spanConfig.links,
                  startFallbackSpan: () => startInactiveMcpNotificationSpan(spanConfig),
                },
                callOriginal,
              );
            }

            return startMcpNotificationSpan(spanConfig, callOriginal);
          });
        }

        return (originalOnMessage as (...args: unknown[]) => unknown).call(this, message, extra);
      };
    });
  }
}

/**
 * Wraps transport.send to handle outgoing messages and response correlation.
 * Caches legacy initialize metadata and applies modern result metadata only to
 * the corresponding request span.
 * @param transport - MCP transport instance to wrap
 * @param options - MCP capture overrides
 * @param hasUpstreamInstrumentation - Whether the MCP SDK may start its own span (see `upstreamInstrumentation.ts`)
 */
export function wrapTransportSend(
  transport: MCPTransport,
  options: McpServerWrapperOptions,
  hasUpstreamInstrumentation = false,
): void {
  if (transport.send) {
    fill(transport, 'send', originalSend => {
      return async function (this: MCPTransport, ...args: unknown[]) {
        const [message, ...restArgs] = args;

        if (isJsonRpcNotification(message)) {
          const resolvedOptions = resolveMcpOptions(options);
          // The MCP SDK sends a notification inside the scope of its own span, so when that span reaches
          // Sentry it is the active one. The method check tells it apart from e.g. the request span of the
          // handler that sends the notification.
          const upstreamSpan = hasUpstreamInstrumentation ? getActiveSpan() : undefined;
          if (upstreamSpan && spanToJSON(upstreamSpan).attributes[MCP_METHOD_NAME] === message.method) {
            upstreamSpan.setAttributes(
              buildMcpNotificationSpanConfig('notification-outgoing', message, transport, resolvedOptions).attributes,
            );
            return (originalSend as (...args: unknown[]) => unknown).call(
              this,
              injectMcpTraceContext(message),
              ...restArgs,
            );
          }
          return createMcpOutgoingNotificationSpan(message, transport, resolvedOptions, () => {
            return (originalSend as (...args: unknown[]) => unknown).call(
              this,
              injectMcpTraceContext(message),
              ...restArgs,
            );
          });
        }

        if (isJsonRpcRequest(message)) {
          return (originalSend as (...args: unknown[]) => unknown).call(
            this,
            injectMcpTraceContext(message),
            ...restArgs,
          );
        }

        if (isJsonRpcResponse(message)) {
          if (message.id !== null && message.id !== undefined) {
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
