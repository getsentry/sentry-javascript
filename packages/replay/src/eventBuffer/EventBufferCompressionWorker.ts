import type { ReplayRecordingData, ReplayRecordingMode } from '@sentry/types';

import type { AddEventResult, EventBuffer, RecordingEvent } from '../types';
import { timestampToMs } from '../util/timestampToMs';
import { WorkerHandler } from './WorkerHandler';

/**
 * Event buffer that uses a web worker to compress events.
 * Exported only for testing.
 */
export class EventBufferCompressionWorker implements EventBuffer {
  private _worker: WorkerHandler;
  private _earliestTimestamp: number | null;
  private _bufferEarliestTimestamp: number | null;

  public constructor(worker: Worker) {
    this._worker = new WorkerHandler(worker);
    this._earliestTimestamp = null;
    this._bufferEarliestTimestamp = null;
  }

  /** @inheritdoc */
  public get hasEvents(): boolean {
    return !!this._earliestTimestamp;
  }

  /**
   * Ensure the worker is ready (or not).
   * This will either resolve when the worker is ready, or reject if an error occured.
   */
  public ensureReady(): Promise<void> {
    return this._worker.ensureReady();
  }

  /**
   * Destroy the event buffer.
   */
  public destroy(): void {
    this._worker.destroy();
  }

  /**
   * Add an event to the event buffer.
   *
   * Returns true if event was successfuly received and processed by worker.
   */
  public addEvent(event: RecordingEvent): Promise<AddEventResult> {
    const timestamp = timestampToMs(event.timestamp);
    if (!this._earliestTimestamp || timestamp < this._earliestTimestamp) {
      this._earliestTimestamp = timestamp;
    }

    /*
      We also update this in parallel, in case we need it.
      At this point we don't really know if this is a buffer recording,
      so just always keeping this is the safest solution.
     */
    if (!this._bufferEarliestTimestamp || timestamp < this._bufferEarliestTimestamp) {
      this._bufferEarliestTimestamp = timestamp;
    }

    return this._sendEventToWorker(event);
  }

  /**
   * Finish the event buffer and return the compressed data.
   */
  public finish(): Promise<ReplayRecordingData> {
    return this._finishRequest();
  }

  /** @inheritdoc */
  public clear(recordingMode: ReplayRecordingMode): void {
    if (recordingMode === 'buffer') {
      /*
        In buffer mode, we want to make sure to always keep the last round of events around.
        So when the time comes and we finish the buffer, we can ensure that we have at least one set of events.
        Without this change, it can happen that you finish right after the last checkout (=clear),
        and thus have no (or very few) events buffered.

        Because of this, we keep track of the previous earliest timestamp as well.
        When the next clear comes, we set the current earliest timestamp to the previous one.
      */
      this._earliestTimestamp = this._bufferEarliestTimestamp;
      this._bufferEarliestTimestamp = null;
    } else {
      this._earliestTimestamp = null;
      this._bufferEarliestTimestamp = null;
    }

    // We do not wait on this, as we assume the order of messages is consistent for the worker
    void this._worker.postMessage('clear', recordingMode);
  }

  /** @inheritdoc */
  public getEarliestTimestamp(): number | null {
    return this._earliestTimestamp;
  }

  /**
   * Send the event to the worker.
   */
  private _sendEventToWorker(event: RecordingEvent): Promise<AddEventResult> {
    return this._worker.postMessage<void>('addEvent', JSON.stringify(event));
  }

  /**
   * Finish the request and return the compressed data from the worker.
   */
  private async _finishRequest(): Promise<Uint8Array> {
    const response = await this._worker.postMessage<Uint8Array>('finish');

    this._earliestTimestamp = null;
    this._bufferEarliestTimestamp = null;

    return response;
  }
}
