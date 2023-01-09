import { PENDING_REPLAY_DATA_KEY, WINDOW } from '../constants';
import { createEventBuffer } from '../eventBuffer';
import type { PendingReplayData, SendReplayData } from '../types';

/**
 * Attempts to flush pending segment that was previously unable to be sent
 * (e.g. due to page reload).
 */
export async function getPendingReplay({ useCompression }: { useCompression: boolean }): Promise<Omit<SendReplayData, 'session'|'options'> | null> {
  try {
    const leftoverData = WINDOW.sessionStorage.getItem(PENDING_REPLAY_DATA_KEY);

    // Potential data that was not flushed
    const parsedData = leftoverData && (JSON.parse(leftoverData) as Partial<PendingReplayData> | null);
    const { recordingData, replayId, segmentId, includeReplayStartTimestamp, eventContext, timestamp } = parsedData || {};

    // Ensure data integrity -- also *skip* includeReplayStartTimestamp as it
    // implies a checkout which we do not store due to potential size
    if (!recordingData || !replayId || !segmentId || !eventContext || !timestamp || includeReplayStartTimestamp) {
      return null;
    }

    // start a local eventBuffer
    const eventBuffer = createEventBuffer({
      useCompression,
    });

    await Promise.all(recordingData.map(event => eventBuffer.addEvent(event)));

    return {
      recordingData: await eventBuffer.finish(),
      replayId,
      segmentId,
      includeReplayStartTimestamp: false,
      eventContext,
      timestamp,
    };
  } catch {
    return null;
  }
}
