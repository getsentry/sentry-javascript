import type { Client } from '../client';
import type { Scope } from '../scope';
import type { TransactionEvent } from '../types/event';
import type { Span } from '../types/span';
import { debounce } from '../utils/debounce';
import { setEventCaptureDecisionCallback } from '../utils/eventCaptureDecision';
import { INTERNAL_getParentSpan } from '../utils/spanUtils';
import { getSegmentSpanCaptureStrategy, setSegmentSpanCaptureStrategy } from './segmentSpanCaptureStrategy';
import type { SegmentSpanConverter } from './segmentSpanCaptureStrategy';
import { hasSpanStreamingEnabled } from './spans/hasSpanStreamingEnabled';

// Spans already sent in a transaction, so a child ending after its segment can be emitted as its own
// orphan transaction instead of being dropped or sent twice.
const CAPTURED_SPANS = new WeakSet<Span>();
const markSpanCaptured = (span: Span): void => {
  CAPTURED_SPANS.add(span);
};

// A transaction is only considered captured after it survives event preparation and all before-send hooks.
// Reserve its spans while that decision is pending so concurrent late-span captures cannot send duplicates.
const PENDING_CAPTURED_SPANS = new WeakSet<Span>();

// Rejection is terminal for a segment. Keeping this separate from pending state lets pending markers
// be cleared at every terminal decision while preventing not-yet-accepted descendants from being emitted.
const REJECTED_SEGMENT_SPANS = new WeakSet<Span>();

function hasRejectedAncestor(span: Span): boolean {
  const visited = new Set<Span>();
  let ancestor = INTERNAL_getParentSpan(span);
  while (ancestor && !visited.has(ancestor)) {
    if (REJECTED_SEGMENT_SPANS.has(ancestor)) {
      return true;
    }

    visited.add(ancestor);
    ancestor = INTERNAL_getParentSpan(ancestor);
  }
  return false;
}

const isSpanCapturedOrUnavailable = (span: Span): boolean =>
  CAPTURED_SPANS.has(span) ||
  PENDING_CAPTURED_SPANS.has(span) ||
  REJECTED_SEGMENT_SPANS.has(span) ||
  hasRejectedAncestor(span);

function getPendingCaptureAncestor(span: Span, rootSpan: Span): Span | undefined {
  const visited = new Set<Span>();
  let ancestor = INTERNAL_getParentSpan(span);
  while (ancestor && !visited.has(ancestor)) {
    if (PENDING_CHILD_CAPTURES.has(ancestor)) {
      return ancestor;
    }

    visited.add(ancestor);
    ancestor = INTERNAL_getParentSpan(ancestor);
  }

  return PENDING_CHILD_CAPTURES.has(rootSpan) ? rootSpan : undefined;
}

function queueUnderPendingAncestor(
  span: Span,
  rootSpan: Span,
  client: Client | undefined,
  capture: () => void,
): boolean {
  const pendingCaptureAncestor = getPendingCaptureAncestor(span, rootSpan);
  if (!pendingCaptureAncestor || pendingCaptureAncestor === span) {
    return false;
  }

  const pendingCaptureClient = PENDING_CAPTURE_CLIENTS.get(pendingCaptureAncestor);
  if (pendingCaptureClient && client !== pendingCaptureClient) {
    return false;
  }

  const previousPendingAncestor = PENDING_PARENT_CAPTURES.get(span);
  if (previousPendingAncestor === pendingCaptureAncestor) {
    return true;
  }

  if (previousPendingAncestor) {
    const previousPendingCaptures = PENDING_CHILD_CAPTURES.get(previousPendingAncestor);
    if (previousPendingCaptures) {
      for (const pendingCapture of previousPendingCaptures) {
        if (pendingCapture.span === span) {
          previousPendingCaptures.delete(pendingCapture);
        }
      }
    }
  }

  ensurePendingChildCaptures(span, client);
  PENDING_PARENT_CAPTURES.set(span, pendingCaptureAncestor);
  PENDING_CHILD_CAPTURES.get(pendingCaptureAncestor)?.add({ span, capture });
  return true;
}

// Children ending while their segment's snapshot is queued or its event is still being processed must wait
// for that event's decision. They are emitted if the segment is accepted and discarded if it is rejected.
// The weak-keyed set is removed at either decision, so no queue of child closures remains afterward.
interface PendingChildCapture {
  span: Span;
  capture: () => void;
}
const PENDING_CHILD_CAPTURES = new WeakMap<Span, Set<PendingChildCapture>>();
// An ended span can move from an outer pending segment to a nearer ancestor which ends later.
const PENDING_PARENT_CAPTURES = new WeakMap<Span, Span>();
const PENDING_CAPTURE_CLIENTS = new WeakMap<Span, Client>();

// One debounced queue per client, drained on the client's `flush`/`close`. Mirrors the OpenTelemetry
// span exporter, which holds one such buffer per instance, and the debounce window matches it. The
// capturing client is resolved from the span's captured scope and bound when the span ends, not
// re-resolved at drain time, so a deferred transaction lands on the client that created the span even if
// the current client (or the captured scope's own client) is reassigned before the debounce fires.
const CLIENT_QUEUES = new WeakMap<Client, (capture: () => void) => void>();

/**
 * @private Private API with no semver guarantees!
 *
 * Enable deferred segment-span transaction capture for a client: create its debounced queue and
 * register the strategy (idempotent).
 *
 * `SentrySpan` otherwise assembles the transaction synchronously the instant a segment span ends, which
 * drops children whose async instrumentation closes them later (a diagnostics-channel `asyncEnd`
 * callback in the same tick, or engine spans replayed on a later tick). The debounced snapshot delays
 * capture just enough for those later span ends to land first. In the static lifecycle, a child that
 * ends after an accepted segment is emitted as its own orphan transaction; if the segment is dropped,
 * its pending descendants remain suppressed. Pending captures drain on the client's `flush` hook, so
 * `Sentry.flush()` / `client.close()` cannot resolve before they run. The strategy is inert for span
 * streaming.
 */
export function _INTERNAL_setDeferSegmentSpanCapture(client: Client): void {
  if (!getSegmentSpanCaptureStrategy()) {
    setSegmentSpanCaptureStrategy(deferredSegmentSpanCaptureStrategy);
  }
  if (CLIENT_QUEUES.has(client)) {
    return;
  }

  const pendingCaptures = new Set<() => void>();
  const debouncedDrain = debounce(
    () => {
      const captures = [...pendingCaptures];
      pendingCaptures.clear();
      for (const capture of captures) {
        capture();
      }
    },
    1,
    { maxWait: 100 },
  );

  client.on('flush', () => {
    debouncedDrain.flush();
  });

  CLIENT_QUEUES.set(client, capture => {
    pendingCaptures.add(capture);
    debouncedDrain();
  });
}

const deferredSegmentSpanCaptureStrategy = {
  onSegmentSpanEnded(segmentSpan: Span, convert: SegmentSpanConverter, scope: Scope): void {
    const client = scope.getClient();
    if (client && hasSpanStreamingEnabled(client)) {
      return;
    }

    const enqueue = client && CLIENT_QUEUES.get(client);
    if (!enqueue) {
      // The capturing client didn't enable deferral: capture synchronously.
      const transactionEvent = convert();
      if (transactionEvent) {
        client?.captureEvent(transactionEvent);
      }
      return;
    }

    ensurePendingChildCaptures(segmentSpan, client);
    enqueue(() => {
      const spansInTransaction: Span[] = [];
      const transactionEvent = convert({
        isSpanAlreadyCaptured: isSpanCapturedOrUnavailable,
        onSpanCaptured: span => spansInTransaction.push(span),
      });
      if (transactionEvent) {
        captureDeferredTransaction(client, segmentSpan, transactionEvent, spansInTransaction);
      } else {
        rejectDeferredSegment(segmentSpan, spansInTransaction);
      }
    });
  },

  onChildSpanEnded(span: Span, rootSpan: Span, convert: SegmentSpanConverter, scope: Scope): void {
    const client = scope.getClient();
    if (client && hasSpanStreamingEnabled(client)) {
      return;
    }

    if (REJECTED_SEGMENT_SPANS.has(rootSpan) || hasRejectedAncestor(span)) {
      return;
    }

    // Only a late child of an already-captured segment is an orphan. Stream clients return above before
    // consulting this module-global capture state.
    if (isSpanCapturedOrUnavailable(span)) {
      return;
    }

    const enqueue = client && CLIENT_QUEUES.get(client);

    const captureOrphan = (): void => {
      const queuedUnderPendingAncestor = queueUnderPendingAncestor(span, rootSpan, client, captureOrphan);

      // A queued ancestor can include this span before its own orphan capture executes.
      if (isSpanCapturedOrUnavailable(span) || hasRejectedAncestor(span)) {
        PENDING_PARENT_CAPTURES.delete(span);
        return;
      }

      if (queuedUnderPendingAncestor) {
        return;
      }

      const spansInTransaction: Span[] = [];
      const transactionEvent = convert({
        isSpanAlreadyCaptured: isSpanCapturedOrUnavailable,
        onSpanCaptured: capturedSpan => spansInTransaction.push(capturedSpan),
      });
      if (transactionEvent?.contexts?.trace?.data) {
        // Tag orphans so they're distinguishable downstream (mirrors the OTel span exporter).
        transactionEvent.contexts.trace.data['sentry.parent_span_already_sent'] = true;
      }
      if (transactionEvent) {
        if (client) {
          PENDING_PARENT_CAPTURES.delete(span);
          captureDeferredTransaction(client, span, transactionEvent, spansInTransaction);
        }
      }
    };

    if (queueUnderPendingAncestor(span, rootSpan, client, captureOrphan)) {
      return;
    }

    if (!CAPTURED_SPANS.has(rootSpan)) {
      return;
    }

    // Defer when the capturing client batches; otherwise emit now so the orphan isn't dropped.
    if (enqueue) {
      ensurePendingChildCaptures(span, client);
      enqueue(captureOrphan);
    } else {
      captureOrphan();
    }
  },
};

/**
 * Reserve a transaction's spans until the client's event pipeline reaches a terminal decision. Rejected
 * segments are tracked independently so pending markers and child closures can always be released.
 */
function captureDeferredTransaction(
  client: Client,
  segmentSpan: Span,
  transactionEvent: TransactionEvent,
  spansInTransaction: Span[],
): void {
  spansInTransaction.forEach(span => PENDING_CAPTURED_SPANS.add(span));
  ensurePendingChildCaptures(segmentSpan, client);

  const hint = {};
  setEventCaptureDecisionCallback(hint, decision => {
    if (decision === 'accepted') {
      spansInTransaction.forEach(span => {
        PENDING_CAPTURED_SPANS.delete(span);
        markSpanCaptured(span);
      });
      drainPendingChildCaptures([...spansInTransaction, segmentSpan]);
      return;
    }

    rejectDeferredSegment(segmentSpan, spansInTransaction);
  });
  client.captureEvent(transactionEvent, hint);
}

function drainPendingChildCaptures(spans: Span[]): void {
  const captures = new Set<PendingChildCapture>();
  spans.forEach(span => {
    PENDING_CHILD_CAPTURES.get(span)?.forEach(capture => captures.add(capture));
    PENDING_CHILD_CAPTURES.delete(span);
    PENDING_CAPTURE_CLIENTS.delete(span);
  });
  captures.forEach(({ span, capture }) => {
    const pendingParentCapture = PENDING_PARENT_CAPTURES.get(span);
    if (pendingParentCapture && !PENDING_CHILD_CAPTURES.has(pendingParentCapture)) {
      PENDING_PARENT_CAPTURES.delete(span);
    }
    capture();
  });
}

function ensurePendingChildCaptures(segmentSpan: Span, client?: Client): void {
  if (!PENDING_CHILD_CAPTURES.has(segmentSpan)) {
    PENDING_CHILD_CAPTURES.set(segmentSpan, new Set());
  }
  if (client) {
    PENDING_CAPTURE_CLIENTS.set(segmentSpan, client);
  }
}

function rejectDeferredSegment(segmentSpan: Span, spansInTransaction: Span[]): void {
  spansInTransaction.forEach(span => {
    PENDING_CAPTURED_SPANS.delete(span);
    REJECTED_SEGMENT_SPANS.add(span);
  });
  REJECTED_SEGMENT_SPANS.add(segmentSpan);
  discardPendingChildCaptures([...spansInTransaction, segmentSpan]);
}

function discardPendingChildCaptures(spans: Span[]): void {
  const pendingSpans = [...spans];
  const visited = new Set<Span>();
  for (const pendingSpan of pendingSpans) {
    if (visited.has(pendingSpan)) {
      continue;
    }

    visited.add(pendingSpan);
    PENDING_CHILD_CAPTURES.get(pendingSpan)?.forEach(({ span }) => {
      PENDING_PARENT_CAPTURES.delete(span);
      pendingSpans.push(span);
    });
    PENDING_CHILD_CAPTURES.delete(pendingSpan);
    PENDING_PARENT_CAPTURES.delete(pendingSpan);
    PENDING_CAPTURE_CLIENTS.delete(pendingSpan);
  }
}
