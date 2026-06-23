import type { Span } from '@sentry/core';
import type { ReplayContainer } from '../types';
import { addTraceIdToContext } from './util/addTraceIdToContext';

type AfterSegmentSpanEndCallback = (segmentSpan: Span) => void;

export function handleAfterSegmentSpanEnd(replay: ReplayContainer): AfterSegmentSpanEndCallback {
  return (segmentSpan: Span) => {
    if (!replay.isEnabled()) {
      return;
    }

    const traceId = segmentSpan.spanContext().traceId;
    if (traceId) {
      addTraceIdToContext(replay, traceId);
    }
  };
}
