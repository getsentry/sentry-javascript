import type { ReplayRecordingData } from '@sentry/types';
import { normalize } from '@sentry/utils';

import type { AddEventResult, EventBuffer, RecordingEvent } from '../types';
import { WorkerHandler } from './WorkerHandler';

/**
 * Event buffer that uses a web worker to compress events.
 * Exported only for testing.
 */
export class EventBufferCompressionWorker implements EventBuffer {
  /** @inheritdoc */
  public hasEvents: boolean;

  private _worker: WorkerHandler;

  public constructor(worker: Worker) {
    this._worker = new WorkerHandler(worker);
    this.hasEvents = false;
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
  public async addEvent(event: RecordingEvent, isCheckout?: boolean): Promise<AddEventResult> {
    this.hasEvents = true;

    if (isCheckout) {
      // This event is a checkout, make sure worker buffer is cleared before
      // proceeding.
      await this._clear();
    }

    return this._sendEventToWorker(event);
  }

  /**
   * Finish the event buffer and return the compressed data.
   */
  public finish(): Promise<ReplayRecordingData> {
    return this._finishRequest();
  }

  /**
   * Send the event to the worker.
   */
  private _sendEventToWorker(event: RecordingEvent): Promise<AddEventResult> {
    return this._worker.postMessage<void>('addEvent', JSON.stringify(normalize(event)));
  }

  /**
   * Finish the request and return the compressed data from the worker.
   */
  private async _finishRequest(): Promise<Uint8Array> {
    const response = await this._worker.postMessage<Uint8Array>('finish');

    this.hasEvents = false;

    return response;
  }

  /** Clear any pending events from the worker. */
  private _clear(): Promise<void> {
    return this._worker.postMessage('clear');
  }
}
