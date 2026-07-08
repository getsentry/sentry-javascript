import type { ReplayContainer } from '../../types';

const MAX_CONTEXT_VALUES = 100;

export function addSegmentDetailsToContext(replay: ReplayContainer, traceId?: string, segmentName?: string): void {
  const replayContext = replay.getContext();
  if (traceId && replayContext.traceIds.size < MAX_CONTEXT_VALUES) {
    replayContext.traceIds.add(traceId);
  }
  if (segmentName && replayContext.segmentNames.size < MAX_CONTEXT_VALUES) {
    replayContext.segmentNames.add(segmentName);
  }
}
