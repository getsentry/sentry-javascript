import { compress } from '@sentry-internal/replay-worker';
import type { ReplayRecordingData } from '@sentry/types';

import type { RecordingEvent } from '../types';

/**
 * Compress replay events for more compact transport.
 * Note that this relies on pako.
 */
export function replayEventCompressor(events: RecordingEvent[]): ReplayRecordingData {
  return compress(JSON.stringify(events));
}
