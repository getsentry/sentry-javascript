/**
 * Newer `@modelcontextprotocol/server` versions start their own OpenTelemetry span for every inbound
 * message once a tracer provider is registered. In that case we add our attributes to that span
 * instead of starting a second one.
 */

import { MCP_METHOD_NAME } from '@sentry/conventions/attributes';
import { getClient } from '../../currentScopes';
import type { Span } from '../../types/span';
import { isObjectLike } from '../../utils/is';
import { spanToJSON } from '../../utils/spanUtils';
import { GLOBAL_OBJ } from '../../utils/worldwide';
import type { JsonRpcError, RequestId } from './types';

interface UpstreamOutcome {
  type: string;
  result?: unknown;
  error?: JsonRpcError;
}

interface UpstreamScope {
  run<T>(fn: () => T): T;
  end(outcome: UpstreamOutcome): void;
}

interface UpstreamInstrumentation {
  receive?: (operation: { method: string; id?: RequestId }) => UpstreamScope | undefined;
}

export interface InboundHandoff {
  method: string;
  id?: RequestId;
  attributes: Record<string, string | number>;
  onResponse?: (span: Span, result: unknown, error: JsonRpcError | undefined) => void;
  /** Used when the MCP SDK's span does not reach Sentry, e.g. because a non-Sentry tracer provider is registered. */
  startOwnSpan: (fn: () => unknown) => unknown;
}

let pendingHandoff: InboundHandoff | undefined;

/** Whether the MCP SDK's built-in instrumentation records spans. */
export function hasGlobalTracerProvider(): boolean {
  const otelApi = (GLOBAL_OBJ as unknown as Record<symbol, { trace?: unknown } | undefined>)[
    Symbol.for('opentelemetry.js.api.1')
  ];
  return !!otelApi?.trace;
}

/**
 * Hooks into the MCP SDK's built-in instrumentation (the package-internal `_instrumentation`).
 * Returns `false` when the server has none.
 */
export function decorateUpstreamInstrumentation(serverInstance: object): boolean {
  const inner = (serverInstance as { server?: unknown }).server;
  const protocol = (isObjectLike(inner) ? inner : serverInstance) as { _instrumentation?: UpstreamInstrumentation };
  const original = protocol._instrumentation;
  if (typeof original?.receive !== 'function') {
    return false;
  }

  protocol._instrumentation = {
    ...original,
    receive: operation => {
      const handoff = pendingHandoff;
      if (handoff?.method !== operation.method || handoff.id !== operation.id) {
        return original.receive?.(operation);
      }
      pendingHandoff = undefined;
      return receiveWithHandoff(handoff, () => original.receive?.(operation));
    },
  };
  return true;
}

/** Runs the original `transport.onmessage`, during which the MCP SDK starts its scope synchronously. */
export function withInboundHandoff<T>(handoff: InboundHandoff, callback: () => T): T {
  pendingHandoff = handoff;
  try {
    return callback();
  } finally {
    pendingHandoff = undefined;
  }
}

function receiveWithHandoff(
  handoff: InboundHandoff,
  receive: () => UpstreamScope | undefined,
): UpstreamScope | undefined {
  let span: Span | undefined;
  const unsubscribe = getClient()?.on('spanStart', startedSpan => {
    if (!span && spanToJSON(startedSpan).attributes[MCP_METHOD_NAME]) {
      span = startedSpan;
    }
  });
  let scope: UpstreamScope | undefined;
  try {
    scope = receive();
  } finally {
    unsubscribe?.();
  }

  if (!scope || !span) {
    return {
      run: fn => handoff.startOwnSpan(() => (scope ? scope.run(fn) : fn())) as ReturnType<typeof fn>,
      end: outcome => scope?.end(outcome),
    };
  }

  const upstreamSpan = span;
  const upstreamScope = scope;
  upstreamSpan.setAttributes(handoff.attributes);
  return {
    run: fn => upstreamScope.run(fn),
    // The MCP SDK ends its span before the response is sent, so the response is recorded here.
    end: outcome => {
      if (outcome.type === 'result' || outcome.type === 'error') {
        handoff.onResponse?.(upstreamSpan, outcome.result, outcome.error);
      }
      upstreamScope.end(outcome);
    },
  };
}
