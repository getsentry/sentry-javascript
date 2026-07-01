import { getMainCarrier, getSentryCarrier } from '../carrier';
import type { Client } from '../client';
import type { Scope } from '../scope';
import type { TransactionEvent } from '../types/event';
import type { Span } from '../types/span';

/**
 * Optional hooks a deferring strategy passes when converting: skip spans already sent, record the ones
 * it sends (for orphan tracking). The synchronous default passes neither.
 */
export interface SegmentSpanCaptureConvertOptions {
  isSpanAlreadyCaptured?: (span: Span) => boolean;
  onSpanCaptured?: (span: Span) => void;
}

export type SegmentSpanConverter = (options?: SegmentSpanCaptureConvertOptions) => TransactionEvent | undefined;

/**
 * Assembles segment spans into transactions. Registered by SDKs that defer capture (see
 * `_INTERNAL_setDeferSegmentSpanCapture`); when unset, `SentrySpan` captures synchronously. Living
 * behind this seam tree-shakes the deferral machinery out of SDKs that never register one (e.g. browser).
 */
export interface SegmentSpanCaptureStrategy {
  /** Assemble and capture a segment (root or standalone-root) span's transaction. */
  onSegmentSpanEnded(scope: Scope, client: Client, convert: SegmentSpanConverter): void;
  /** Consider a child that ended after its segment for emission as its own orphan transaction. */
  onChildSpanEnded(span: Span, rootSpan: Span, client: Client, convert: SegmentSpanConverter): void;
}

/**
 * @private Private API with no semver guarantees!
 *
 * Set the global segment-span capture strategy (or clear it with `undefined`).
 */
export function setSegmentSpanCaptureStrategy(strategy: SegmentSpanCaptureStrategy | undefined): void {
  getSentryCarrier(getMainCarrier()).segmentSpanCaptureStrategy = strategy;
}

/** Get the global segment-span capture strategy, or `undefined` when none is registered. */
export function getSegmentSpanCaptureStrategy(): SegmentSpanCaptureStrategy | undefined {
  return getSentryCarrier(getMainCarrier()).segmentSpanCaptureStrategy;
}
