import type { Client } from '../client';
import { getCurrentScope } from '../currentScopes';
import type { Scope } from '../scope';
import type { Span } from '../types/span';
import { debounce } from '../utils/debounce';
import {
  getSegmentSpanCaptureStrategy,
  type SegmentSpanConverter,
  setSegmentSpanCaptureStrategy,
} from './segmentSpanCaptureStrategy';
import { getCapturedScopesOnSpan } from './utils';

// Spans already sent in a transaction, so a child ending after its segment can be emitted as its own
// orphan transaction instead of being dropped or sent twice.
const CAPTURED_SPANS = new WeakSet<Span>();

const isSpanAlreadyCaptured = (span: Span): boolean => CAPTURED_SPANS.has(span);
const markSpanCaptured = (span: Span): void => {
  CAPTURED_SPANS.add(span);
};

// Per-client so each client's flush/close drains only its own captures: one client's flush must not
// snapshot another's transaction early. Mirrors the per-client log/metric buffers.
const CLIENT_QUEUES = new WeakMap<Client, DeferredCaptureQueue>();

interface DeferredCaptureQueue {
  enqueue: (capture: () => void) => void;
  flush: () => void;
}

/**
 * @private Private API with no semver guarantees!
 *
 * Enable deferred segment-span transaction capture for a client (idempotent per client). Deferring the
 * snapshot lets children that close just after their segment still land in the transaction; pending
 * captures drain on `flush`, so `Sentry.flush()` / `client.close()` cannot resolve before they run.
 */
export function _INTERNAL_setDeferSegmentSpanCapture(client: Client): void {
  if (!getSegmentSpanCaptureStrategy()) {
    setSegmentSpanCaptureStrategy(deferredSegmentSpanCaptureStrategy);
  }
  // A client that never opts in has no queue and falls back to synchronous capture below.
  getClientQueue(client);
}

const deferredSegmentSpanCaptureStrategy = {
  onSegmentSpanEnded(scope: Scope, client: Client, convert: SegmentSpanConverter): void {
    const queue = CLIENT_QUEUES.get(client);
    if (!queue) {
      // Client never opted into deferral: capture synchronously, exactly as if no strategy existed.
      const transactionEvent = convert();
      if (transactionEvent) {
        scope.captureEvent(transactionEvent);
      }
      return;
    }

    queue.enqueue(() => {
      const transactionEvent = convert({ isSpanAlreadyCaptured, onSpanCaptured: markSpanCaptured });
      if (transactionEvent) {
        // Capture via the client active at span end (passing its scope for context), so a later-tick
        // capture reaches that client even if the current client changed since (e.g. after re-init).
        client.captureEvent(transactionEvent, undefined, scope);
      }
    });
  },

  onChildSpanEnded(span: Span, rootSpan: Span, client: Client, convert: SegmentSpanConverter): void {
    const queue = CLIENT_QUEUES.get(client);
    // Only a late child of an already-captured segment is an orphan. Inert under span streaming, where
    // `CAPTURED_SPANS` is never populated.
    if (!queue || CAPTURED_SPANS.has(span) || !CAPTURED_SPANS.has(rootSpan)) {
      return;
    }

    const scope = getCapturedScopesOnSpan(span).scope || getCurrentScope();
    queue.enqueue(() => {
      const transactionEvent = convert({ isSpanAlreadyCaptured, onSpanCaptured: markSpanCaptured });
      if (transactionEvent?.contexts?.trace?.data) {
        // Tag orphans so they're distinguishable downstream (mirrors the OTel span exporter).
        transactionEvent.contexts.trace.data['sentry.parent_span_already_sent'] = true;
      }
      if (transactionEvent) {
        client.captureEvent(transactionEvent, undefined, scope);
      }
    });
  },
};

function getClientQueue(client: Client): DeferredCaptureQueue {
  const existing = CLIENT_QUEUES.get(client);
  if (existing) {
    return existing;
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

  const queue: DeferredCaptureQueue = {
    enqueue: capture => {
      pendingCaptures.add(capture);
      debouncedDrain();
    },
    flush: () => {
      debouncedDrain.flush();
    },
  };

  client.on('flush', () => {
    queue.flush();
  });

  CLIENT_QUEUES.set(client, queue);
  return queue;
}
