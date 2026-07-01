import type { Client } from '../client';
import type { Scope } from '../scope';
import type { Span } from '../types/span';
import { debounce } from '../utils/debounce';
import { getSegmentSpanCaptureStrategy, setSegmentSpanCaptureStrategy } from './segmentSpanCaptureStrategy';
import type { SegmentSpanConverter } from './segmentSpanCaptureStrategy';

// Spans already sent in a transaction, so a child ending after its segment can be emitted as its own
// orphan transaction instead of being dropped or sent twice.
const CAPTURED_SPANS = new WeakSet<Span>();
const isSpanAlreadyCaptured = (span: Span): boolean => CAPTURED_SPANS.has(span);
const markSpanCaptured = (span: Span): void => {
  CAPTURED_SPANS.add(span);
};

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
 * capture just enough for those later span ends to land first; a child that still ends after it is
 * emitted as its own orphan transaction. Pending captures drain on the client's `flush` hook, so
 * `Sentry.flush()` / `client.close()` cannot resolve before they run.
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
  onSegmentSpanEnded(convert: SegmentSpanConverter, scope: Scope): void {
    const client = scope.getClient();
    const enqueue = client && CLIENT_QUEUES.get(client);
    if (!enqueue) {
      // The capturing client didn't enable deferral: capture synchronously.
      const transactionEvent = convert();
      if (transactionEvent) {
        client?.captureEvent(transactionEvent);
      }
      return;
    }

    enqueue(() => {
      const transactionEvent = convert({ isSpanAlreadyCaptured, onSpanCaptured: markSpanCaptured });
      if (transactionEvent) {
        client.captureEvent(transactionEvent);
      }
    });
  },

  onChildSpanEnded(span: Span, rootSpan: Span, convert: SegmentSpanConverter, scope: Scope): void {
    // Only a late child of an already-captured segment is an orphan. Inert under span streaming, where
    // `CAPTURED_SPANS` is never populated.
    if (CAPTURED_SPANS.has(span) || !CAPTURED_SPANS.has(rootSpan)) {
      return;
    }

    const client = scope.getClient();
    const enqueue = client && CLIENT_QUEUES.get(client);

    const captureOrphan = (): void => {
      const transactionEvent = convert({ isSpanAlreadyCaptured, onSpanCaptured: markSpanCaptured });
      if (transactionEvent?.contexts?.trace?.data) {
        // Tag orphans so they're distinguishable downstream (mirrors the OTel span exporter).
        transactionEvent.contexts.trace.data['sentry.parent_span_already_sent'] = true;
      }
      if (transactionEvent) {
        client?.captureEvent(transactionEvent);
      }
    };

    // Defer when the capturing client batches; otherwise emit now so the orphan isn't dropped.
    if (enqueue) {
      enqueue(captureOrphan);
    } else {
      captureOrphan();
    }
  },
};
