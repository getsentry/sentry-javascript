import type { ReplayRecordingData } from '@sentry/types';

import type { RecordingEvent } from '../types';
import { EventBufferArray } from './EventBufferArray';
import { WorkerHandler } from './WorkerHandler';

/**
 * Event buffer that uses a web worker to compress events.
 * Exported only for testing.
 */
export class EventBufferPartitionedCompressionWorker extends EventBufferArray {
  private _worker: WorkerHandler;

  public constructor(worker: Worker) {
    super();
    this._worker = new WorkerHandler(worker);
  }
  /**
   * Ensure the worker is ready (or not).
   * This will either resolve when the worker is ready, or reject if an error occured.
   */
  public ensureReady(): Promise<void> {
    return this._worker.ensureReady();
  }

  /** @inheritdoc */
  public destroy(): void {
    this._worker.destroy();
    super.destroy();
  }

  /**
   * Finish the event buffer and return the compressed data.
   */
  public finish(): Promise<ReplayRecordingData> {
    const { events } = this;
    this._events.clear();

    return this._compressEvents(events);
  }

  /** Compress a given array of events at once. */
  private _compressEvents(events: RecordingEvent[]): Promise<Uint8Array> {
    return this._worker.postMessage<Uint8Array>('compress', JSON.stringify(events));
  }
}
