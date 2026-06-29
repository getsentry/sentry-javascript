import type { StreamedSpanJSON } from '@sentry/core';
import type { ReplayContainer } from '../types';
import { addSegmentDetailsToContext } from './util/addSegmentDetailsToContext';

type ProcessSegmentSpanCallback = (spanJSON: StreamedSpanJSON) => void;

export function handleProcessSegmentSpan(replay: ReplayContainer): ProcessSegmentSpanCallback {
  return (spanJSON: StreamedSpanJSON) => {
    if (!replay.isEnabled()) {
      return;
    }

    const traceId = spanJSON.trace_id;
    const segmentName = spanJSON.name;
    if (traceId && segmentName) {
      addSegmentDetailsToContext(replay, traceId, segmentName);
    }
  };
}
