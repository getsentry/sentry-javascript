import type { ReplayContainer } from '../../types';

const MAX_CONTEXT_VALUES = 100;

export function addSegmentDetailsToContext(replay: ReplayContainer, traceId: string, segmentName: string): void {
  const replayContext = replay.getContext();
  if (replayContext.traceIds.size < MAX_CONTEXT_VALUES) {
    replayContext.traceIds.add(traceId);
  }
  if (replayContext.segmentNames.size < MAX_CONTEXT_VALUES) {
    replayContext.segmentNames.add(segmentName);
  }
}
