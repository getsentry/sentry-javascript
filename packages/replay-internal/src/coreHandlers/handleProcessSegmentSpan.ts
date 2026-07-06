import type { StreamedSpanJSON } from '@sentry/core';
import type { ReplayContainer } from '../types';
import { addSegmentDetailsToContext } from './util/addSegmentDetailsToContext';

type ProcessSegmentSpanCallback = (spanJSON: StreamedSpanJSON) => void;

export function handleProcessSegmentSpan(replay: ReplayContainer): ProcessSegmentSpanCallback {
  return (spanJSON: StreamedSpanJSON) => {
    if (!replay.isEnabled()) {
      return;
    }

    addSegmentDetailsToContext(replay, spanJSON.trace_id, spanJSON.name || undefined);
  };
}
