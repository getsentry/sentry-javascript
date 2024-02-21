import type { NetworkRequestData, ReplayContainer, ReplayPerformanceEntry } from '../../types';
import { createPerformanceSpans } from '../../util/createPerformanceSpans';
import { shouldFilterRequest } from '../../util/shouldFilterRequest';

/** Add a performance entry breadcrumb */
export function addNetworkBreadcrumb(
  replay: ReplayContainer,
  result: ReplayPerformanceEntry<NetworkRequestData> | null,
): void {
  if (!replay.isEnabled()) {
    return;
  }

  if (result === null) {
    return;
  }

  if (shouldFilterRequest(replay, result.name)) {
    return;
  }

  replay.addUpdate(() => {
    createPerformanceSpans(replay, [result]);
    // Returning true will cause `addUpdate` to not flush
    // We do not want network requests to cause a flush. This will prevent
    // recurring/polling requests from keeping the replay session alive.
    return true;
  });
}
