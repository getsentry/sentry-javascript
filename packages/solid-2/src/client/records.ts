import type { Span } from '@sentry/core';
import { startInactiveSpan } from '@sentry/core';
import type { CallEvent, CallLive, FrameEvent, FrameLive } from '@solidjs/web';
import { describeOrigin } from '../common/target';
import { epochSeconds, round } from '../common/time';

const CALL_ORIGIN = 'auto.http.solid.call';
const FRAME_ORIGIN = 'auto.ui.solid.frame';

/**
 * One span per server-function call the page made, as the caller awaited it:
 * the twin of the server's `"invocation"` span (same `id`; the difference is
 * the wire). The browser SDK's own `http.client` span for the fetch is the
 * transport's view — this one is the runtime's, includes decode, and knows
 * the function rather than the URL. A failed call sets the span's status
 * only: the error itself reaches the caller, and whatever catches it there
 * (an `<Errored>`, the server error hook on the other side) reports it once.
 */
export function callSpan(
  event: CallEvent,
  _live: CallLive,
  parent: Span | null,
  keepText: boolean,
  afterSettle = false,
): Span {
  const origin = event.origin;
  const span = startInactiveSpan({
    name: event.id,
    op: 'function.solid.call',
    parentSpan: parent,
    startTime: epochSeconds(event.at),
    attributes: {
      'solid.server_function.id': event.id,
      'solid.server_function.method': event.method,
      'solid.server_function.outcome': event.outcome,
      'solid.server_function.deferred': event.deferred === true,
      'solid.server_function.origin': origin ? describeOrigin(origin, keepText) : undefined,
      'solid.server_function.origin.kind': origin?.kind,
      'http.response.status_code': event.status,
      'solid.server_function.after_settle': afterSettle ? true : undefined,
      'sentry.origin': CALL_ORIGIN,
    },
  });
  if (event.outcome === 'error') {
    span.setStatus({ code: 2, message: event.status !== undefined ? `http ${event.status}` : 'network_error' });
  }
  span.end(epochSeconds(event.at + event.durationMs));
  return span;
}

/** One span per frame stream the server-component transport applied, with the chunk census. */
export function frameSpan(event: FrameEvent, _live: FrameLive): void {
  if (event.side !== 'client') return;
  const span = startInactiveSpan({
    name: event.id || 'frame',
    op: 'solid.frame.apply',
    startTime: epochSeconds(event.at),
    attributes: {
      'solid.frame.id': event.id,
      'solid.frame.address': event.address,
      'solid.frame.version': event.version,
      'solid.frame.outcome': event.outcome,
      'solid.frame.shellMs': event.shellMs === undefined ? undefined : round(event.shellMs),
      'solid.frame.chunks': event.chunks,
      'solid.frame.fragments': event.fragments,
      'solid.frame.slots': event.slots,
      'solid.frame.regions': event.regions,
      'solid.frame.errors': event.errors,
      'sentry.origin': FRAME_ORIGIN,
    },
  });
  if (event.outcome !== 'complete') {
    span.setStatus({ code: 2, message: event.outcome });
  }
  span.end(epochSeconds(event.at + event.durationMs));
}
