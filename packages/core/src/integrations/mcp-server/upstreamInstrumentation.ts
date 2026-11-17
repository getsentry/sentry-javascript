/**
 * Newer `@modelcontextprotocol/server` versions start their own OpenTelemetry span for every inbound
 * message. When that span reaches Sentry, we add our attributes to it instead of starting a second one.
 *
 * The SDK starts that span in `_instrumentation.receive`, which it calls synchronously from
 * `transport.onmessage`. So our `onmessage` wrapper parks the message's span data in `pendingHandoff`
 * (see `withUpstreamSpanHandoff`), and our wrapped `receive` picks it up and decides per message:
 * - The SDK's span reaches Sentry: enrich it.
 * - It doesn't (a non-Sentry tracer provider, or none at all): start our own span instead.
 */

import { getClient } from '../../currentScopes';
import { withActiveSpan } from '../../tracing';
import type { SpanLink } from '../../types/link';
import type { Span } from '../../types/span';
import { isObjectLike } from '../../utils/is';
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
  send?: (operation: { method: string; id?: RequestId }) => UpstreamScope | undefined;
  receive?: (operation: { method: string; id?: RequestId }) => UpstreamScope | undefined;
}

/** Span data for one inbound message, for whichever span ends up representing it. */
export interface UpstreamSpanHandoff {
  method: string;
  /** Unset for notifications. */
  id?: RequestId;
  attributes: Record<string, string | number>;
  links?: SpanLink[];
  onResponse?: (span: Span, result: unknown, error: JsonRpcError | undefined) => void;
  startFallbackSpan: () => Span;
}

let pendingHandoff: UpstreamSpanHandoff | undefined;

/**
 * Wraps the MCP SDK's package-internal `_instrumentation.receive` and `_instrumentation.send`.
 * Returns `false` when the server has no such instrumentation (MCP SDK v1, v2 <= 2.4, or `openTelemetry: false`).
 */
export function hookUpstreamInstrumentation(serverInstance: object): boolean {
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
      // Only take a handoff that was parked for this exact message.
      if (handoff?.method !== operation.method || handoff.id !== operation.id) {
        return original.receive?.(operation);
      }
      pendingHandoff = undefined;
      return receiveWithHandoff(handoff, () => original.receive?.(operation));
    },
    // Outgoing notifications are enriched in `transport.send`, which finds the SDK's span as the active span.
    send: original.send && (operation => activateUpstreamSpan(() => original.send?.(operation))),
  };
  return true;
}

/** Runs the MCP SDK's `onmessage` with `handoff` parked for its `receive` call. */
export function withUpstreamSpanHandoff<T>(handoff: UpstreamSpanHandoff, onMessage: () => T): T {
  pendingHandoff = handoff;
  try {
    return onMessage();
  } finally {
    // The SDK skips `receive` for messages it drops, e.g. notifications without a handler.
    pendingHandoff = undefined;
  }
}

function startUpstreamScope(start: () => UpstreamScope | undefined): {
  scope: UpstreamScope | undefined;
  upstreamSpan: Span | undefined;
} {
  // The span the SDK starts here only reaches `spanStart` if it is a Sentry span.
  let upstreamSpan: Span | undefined;
  const unsubscribe = getClient()?.on('spanStart', span => {
    upstreamSpan ??= span;
  });
  try {
    return { scope: start(), upstreamSpan };
  } finally {
    unsubscribe?.();
  }
}

// The SDK activates its span through the OpenTelemetry context, which is not Sentry's scope on every
// runtime (e.g. Deno, which has no OpenTelemetry context manager).
function runInUpstreamSpan<T>(span: Span, scope: UpstreamScope, fn: () => T): T {
  return withActiveSpan(span, () => scope.run(fn));
}

function activateUpstreamSpan(send: () => UpstreamScope | undefined): UpstreamScope | undefined {
  const { scope, upstreamSpan } = startUpstreamScope(send);
  if (!scope || !upstreamSpan) {
    return scope;
  }
  return { run: fn => runInUpstreamSpan(upstreamSpan, scope, fn), end: outcome => scope.end(outcome) };
}

function receiveWithHandoff(
  handoff: UpstreamSpanHandoff,
  receive: () => UpstreamScope | undefined,
): UpstreamScope | undefined {
  const { scope, upstreamSpan } = startUpstreamScope(receive);

  if (!scope || !upstreamSpan) {
    // Started now rather than in `run`, because the SDK answers some requests without running a handler.
    const fallbackSpan = handoff.startFallbackSpan();
    return {
      run: fn => withActiveSpan(fallbackSpan, () => (scope ? scope.run(fn) : fn())),
      end: outcome => {
        scope?.end(outcome);
        // A request span is ended when its response is sent; a notification has no response.
        if (handoff.id === undefined) {
          fallbackSpan.end();
        }
      },
    };
  }

  const span = upstreamSpan;
  const upstreamScope = scope;
  span.setAttributes(handoff.attributes);
  if (handoff.links) {
    span.addLinks(handoff.links);
  }
  return {
    run: fn => runInUpstreamSpan(span, upstreamScope, fn),
    // The SDK ends its span before sending the response, so the response is recorded here.
    end: outcome => {
      if (outcome.type === 'result' || outcome.type === 'error') {
        handoff.onResponse?.(span, outcome.result, outcome.error);
      }
      upstreamScope.end(outcome);
    },
  };
}
