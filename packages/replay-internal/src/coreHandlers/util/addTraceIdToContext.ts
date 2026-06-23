import type { ReplayContainer } from '../../types';

const MAX_TRACE_IDS = 100;

export function addTraceIdToContext(replay: ReplayContainer, traceId: string): void {
  const replayContext = replay.getContext();
  if (replayContext.traceIds.size < MAX_TRACE_IDS) {
    replayContext.traceIds.add(traceId);
  }
}
