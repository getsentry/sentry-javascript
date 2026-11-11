/**
 * Hand-off to the OpenTelemetry instrumentation built into `@modelcontextprotocol/server`.
 *
 * Newer `@modelcontextprotocol/server` versions start their own span for every request and
 * notification through the global OpenTelemetry API. When a tracer provider is registered, those
 * spans would duplicate ours, so the server span the SDK starts is enriched with our attributes
 * instead of starting a second one. Without a tracer provider the SDK records nothing and the
 * transport instrumentation keeps starting its own spans.
 */

import { MCP_METHOD_NAME } from '@sentry/conventions/attributes';
import { getClient } from '../../currentScopes';
import type { Span } from '../../types/span';
import { isObjectLike } from '../../utils/is';
import { spanToJSON } from '../../utils/spanUtils';
import { GLOBAL_OBJ } from '../../utils/worldwide';
import type { JsonRpcError, RequestId } from './types';

const OTEL_API_GLOBAL_KEY = Symbol.for('opentelemetry.js.api.1');

/** The outcome the MCP SDK reports when it ends an operation. */
export type UpstreamOutcome =
  | { type: 'result'; result: unknown }
  | { type: 'error'; error: JsonRpcError; cause?: unknown }
  | { type: string };

interface UpstreamOperation {
  method: string;
  id?: RequestId;
}

interface UpstreamScope {
  run<T>(fn: () => T): T;
  end(outcome: UpstreamOutcome): void;
}

interface UpstreamInstrumentation {
  send?: (operation: UpstreamOperation) => UpstreamScope | undefined;
  receive?: (operation: UpstreamOperation) => UpstreamScope | undefined;
}

/** What the transport instrumentation hands over for one inbound message. */
export interface InboundHandoff {
  method: string;
  id?: RequestId;
  /** Enriches the span the MCP SDK started; the returned callback runs right before the SDK ends it. */
  adopt(span: Span): ((outcome: UpstreamOutcome) => void) | void;
  /** Runs the message's work in a Sentry span when the SDK's span did not reach Sentry. */
  runInOwnSpan<T>(fn: () => T): T;
}

const decoratedProtocols = new WeakSet<object>();

let pendingHandoff: InboundHandoff | undefined;

/**
 * Whether an OpenTelemetry tracer provider is registered globally, i.e. whether the MCP SDK's
 * built-in instrumentation records spans.
 */
function hasGlobalTracerProvider(): boolean {
  const registry = (GLOBAL_OBJ as unknown as Record<symbol, Record<string, unknown> | undefined>)[OTEL_API_GLOBAL_KEY];
  return !!registry?.trace;
}

/** The `Protocol` instance behind an `McpServer` (`server.server`) or a low-level `Server`. */
function getProtocol(serverInstance: object): Record<string, unknown> | undefined {
  const inner = (serverInstance as { server?: unknown }).server;
  const protocol = isObjectLike(inner) ? inner : serverInstance;
  const instrumentation = (protocol as Record<string, unknown>)._instrumentation;
  return isObjectLike(instrumentation) && typeof (instrumentation as UpstreamInstrumentation).receive === 'function'
    ? (protocol as Record<string, unknown>)
    : undefined;
}

/**
 * Installs the hand-off on the MCP SDK's built-in instrumentation of this server, if it has one.
 * `_instrumentation` is package-internal to the MCP SDK; without it, nothing changes.
 */
export function decorateUpstreamInstrumentation(serverInstance: object): void {
  const protocol = getProtocol(serverInstance);
  if (!protocol || decoratedProtocols.has(protocol)) {
    return;
  }

  const original = protocol._instrumentation as UpstreamInstrumentation;
  protocol._instrumentation = {
    ...original,
    receive: (operation: UpstreamOperation) => receiveWithHandoff(original, operation),
  };
  decoratedProtocols.add(protocol);
}

/**
 * Whether inbound messages of this server should be handed off to the MCP SDK's instrumentation
 * instead of being wrapped in a span by the transport instrumentation.
 */
export function shouldHandOffToUpstream(serverInstance: object | undefined): boolean {
  if (!serverInstance) {
    return false;
  }
  const protocol = getProtocol(serverInstance);
  return !!protocol && decoratedProtocols.has(protocol) && hasGlobalTracerProvider();
}

/**
 * Runs `callback` (the original `transport.onmessage`) with `handoff` pending. The MCP SDK starts
 * its instrumentation scope synchronously while the message is dispatched, which takes it.
 */
export function withInboundHandoff<T>(handoff: InboundHandoff, callback: () => T): T {
  const previous = pendingHandoff;
  pendingHandoff = handoff;
  try {
    return callback();
  } finally {
    pendingHandoff = previous;
  }
}

function receiveWithHandoff(
  original: UpstreamInstrumentation,
  operation: UpstreamOperation,
): UpstreamScope | undefined {
  const handoff = pendingHandoff;
  if (!handoff || handoff.method !== operation.method || handoff.id !== operation.id) {
    return original.receive?.(operation);
  }
  pendingHandoff = undefined;

  const { scope, span } = captureStartedSpan(() => original.receive?.(operation));

  if (span && scope) {
    let beforeEnd: ((outcome: UpstreamOutcome) => void) | void = undefined;
    try {
      beforeEnd = handoff.adopt(span);
    } catch {
      // noop
    }
    return {
      run: fn => scope.run(fn),
      end: outcome => {
        try {
          beforeEnd?.(outcome);
        } catch {
          // noop
        }
        scope.end(outcome);
      },
    };
  }

  // The SDK's span did not reach Sentry, e.g. because the registered tracer provider isn't Sentry's.
  return {
    run: fn => handoff.runInOwnSpan(() => (scope ? scope.run(fn) : fn())),
    end: outcome => scope?.end(outcome),
  };
}

function captureStartedSpan(start: () => UpstreamScope | undefined): {
  scope: UpstreamScope | undefined;
  span: Span | undefined;
} {
  let span: Span | undefined;
  const unsubscribe = getClient()?.on('spanStart', startedSpan => {
    if (!span && spanToJSON(startedSpan).attributes[MCP_METHOD_NAME] !== undefined) {
      span = startedSpan;
    }
  });

  try {
    const scope = start();
    return { scope, span };
  } finally {
    unsubscribe?.();
  }
}
