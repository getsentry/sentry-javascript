import type { Span } from '@sentry/core';
import { debug, defineIntegration, getActiveSpan, getTraceData, spanToJSON, startInactiveSpan } from '@sentry/core';
import type { FrameEvent, FrameLive, InvocationEvent, InvocationLive, TraceContext } from '@solidjs/web';
import type { BoundaryEvent, BoundaryLive } from 'solid-js';
import { OBSERVE } from 'solid-js';
import type { DiagnosticsOptions } from '../common/diagnostics';
import { captureDiagnostic } from '../common/diagnostics';
import { epochSeconds } from '../common/time';
import { DEBUG_BUILD } from '../debug-build';

const INTEGRATION_NAME = 'SolidServerTracing';
const ORIGIN = 'auto.function.solid.server';

let uninstall: (() => void) | undefined;

export interface SolidServerTracingOptions {
  /** Report the runtime's server diagnostics as issues (default on, `warn` and up). `false` disables. */
  diagnostics?: DiagnosticsOptions | false;
}

/**
 * The server half of Solid 2 tracing, all through `OBSERVE`: the trace
 * provider that lets the runtime carry Sentry's trace to the browser on its
 * own two carriers (`Server-Timing` on every response, the `<meta>` pair in
 * an HTML shell — no middleware, no body rewriting, works for frames and RPC
 * responses that have no `<head>`), and one span per server-function
 * execution, per `<Loading>` boundary that waited, and per frame stream
 * produced — each delivered inside the request's async context, so they
 * parent on the active `http.server` span. Inert without `OBSERVE`.
 */
export const solidServerTracingIntegration = defineIntegration((options: SolidServerTracingOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      if (OBSERVE === undefined) {
        DEBUG_BUILD && debug.warn('solidServerTracingIntegration: solid-js is not an observe build; no traces');
        return;
      }
      // Solid's slots are process-wide, not per client: a second `init`
      // replaces the previous provider and subscriptions rather than stacking.
      uninstall?.();
      const off = [
        OBSERVE.server.trace.provide(traceProvider),
        OBSERVE.records.subscribe('invocation', invocationSpan),
        OBSERVE.records.subscribe('boundary', boundarySpan),
        OBSERVE.records.subscribe('frame', (event, live) => {
          if (event.side === 'server') frameSpan(event, live);
        }),
      ];
      if (options.diagnostics !== false) {
        const diagnosticsOptions = options.diagnostics;
        off.push(OBSERVE.diagnostics.subscribe(event => captureDiagnostic(event, diagnosticsOptions)));
      }
      uninstall = () => {
        for (const fn of off) fn();
        uninstall = undefined;
      };
    },
  };
});

/**
 * Called by the runtime once per request, inside the request's async
 * context, where the `http.server` span is active. The parent is overridden
 * too: the browser sends `sentry-trace` and `traceparent` with different span
 * ids, `@sentry/node` continues from the former while the runtime derives
 * its parent from the latter — here Sentry's view wins.
 */
function traceProvider(): Partial<TraceContext> | undefined {
  const span = getActiveSpan();
  if (!span) return undefined;
  const context = span.spanContext();
  const data = getTraceData();
  const entries: Record<string, string> = {};
  if (data['sentry-trace']) entries['sentry-trace'] = data['sentry-trace'];
  if (data.baggage) entries.baggage = data.baggage;
  return {
    traceId: context.traceId,
    spanId: context.spanId,
    parentId: spanToJSON(span).parent_span_id,
    sampled: context.traceFlags % 2 === 1,
    entries,
  };
}

function invocationSpan(event: InvocationEvent, _live: InvocationLive): Span {
  const start = epochSeconds(event.at);
  const span = startInactiveSpan({
    name: event.id,
    op: event.direct ? 'function.solid.direct' : 'function.solid.rpc',
    startTime: start,
    attributes: {
      'solid.server_function.id': event.id,
      'solid.server_function.direct': event.direct,
      'solid.server_function.deferred': event.deferred === true,
      'solid.server_function.outcome': event.outcome,
      'solid.server_function.boundary': event.boundary,
      'sentry.origin': ORIGIN,
    },
  });
  // Status only: the server error hook already captured the throw, once,
  // with where it was met (`solidServerErrorsIntegration`).
  if (event.outcome === 'error') span.setStatus({ code: 2, message: 'internal_error' });
  span.end(epochSeconds(event.at + event.durationMs));
  return span;
}

function boundarySpan(event: BoundaryEvent, _live: BoundaryLive): Span {
  const span = startInactiveSpan({
    name: event.ownerPath ? event.ownerPath.join(' › ') : `boundary ${event.id}`,
    op: 'solid.boundary',
    startTime: epochSeconds(event.at),
    attributes: {
      'solid.boundary.id': event.id,
      'solid.boundary.outcome': event.outcome,
      'solid.boundary.passes': event.passes,
      'solid.boundary.streamed': event.streamed,
      'solid.boundary.heldMs': event.heldMs,
      'solid.boundary.revealGroup': event.revealGroup,
      'sentry.origin': ORIGIN,
    },
  });
  if (event.outcome === 'error') span.setStatus({ code: 2, message: 'internal_error' });
  span.end(epochSeconds(event.at + event.durationMs + event.heldMs));
  return span;
}

function frameSpan(event: FrameEvent, _live: FrameLive): Span {
  const span = startInactiveSpan({
    name: event.id || 'frame',
    op: 'solid.frame.produce',
    startTime: epochSeconds(event.at),
    attributes: {
      'solid.frame.id': event.id,
      'solid.frame.version': event.version,
      'solid.frame.outcome': event.outcome,
      'solid.frame.shellMs': event.shellMs,
      'solid.frame.chunks': event.chunks,
      'solid.frame.fragments': event.fragments,
      'solid.frame.slots': event.slots,
      'solid.frame.regions': event.regions,
      'solid.frame.errors': event.errors,
      'sentry.origin': ORIGIN,
    },
  });
  if (event.outcome === 'error') span.setStatus({ code: 2, message: 'internal_error' });
  span.end(epochSeconds(event.at + event.durationMs));
  return span;
}
