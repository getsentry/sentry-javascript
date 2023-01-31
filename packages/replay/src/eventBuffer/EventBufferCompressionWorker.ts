import type { ReplayRecordingData } from '@sentry/types';
import { logger } from '@sentry/utils';

import type { AddEventResult, EventBuffer, RecordingEvent, WorkerRequest, WorkerResponse } from '../types';

/**
 * Event buffer that uses a web worker to compress events.
 * Exported only for testing.
 */
export class EventBufferCompressionWorker implements EventBuffer {
  /** @inheritdoc */
  public hasEvents: boolean;

  private _worker: Worker;
  private _id: number;
  private _ensureReadyPromise?: Promise<void>;

  public constructor(worker: Worker) {
    this._worker = worker;
    this.hasEvents = false;
    this._id = 0;
  }

  /**
   * Ensure the worker is ready (or not).
   * This will either resolve when the worker is ready, or reject if an error occured.
   */
  public ensureReady(): Promise<void> {
    // Ensure we only check once
    if (this._ensureReadyPromise) {
      return this._ensureReadyPromise;
    }

    this._ensureReadyPromise = new Promise((resolve, reject) => {
      this._worker.addEventListener(
        'message',
        ({ data }: MessageEvent) => {
          if ((data as WorkerResponse).success) {
            resolve();
          } else {
            reject();
          }
        },
        { once: true },
      );

      this._worker.addEventListener(
        'error',
        error => {
          reject(error);
        },
        { once: true },
      );
    });

    return this._ensureReadyPromise;
  }

  /**
   * Destroy the event buffer.
   */
  public destroy(): void {
    __DEBUG_BUILD__ && logger.log('[Replay] Destroying compression worker');
    this._worker.terminate();
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
      await this._postMessage({
        id: this._getAndIncrementId(),
        method: 'clear',
      });
    }

    return this._sendEventToWorker(event);
  }

  /**
   * Finish the event buffer and return the compressed data.
   */
  public finish(): Promise<ReplayRecordingData> {
    return this._finishRequest(this._getAndIncrementId());
  }

  /**
   * Post message to worker and wait for response before resolving promise.
   */
  private _postMessage<T>({ id, method, arg }: WorkerRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      const listener = ({ data }: MessageEvent): void => {
        const response = data as WorkerResponse;
        if (response.method !== method) {
          return;
        }

        // There can be multiple listeners for a single method, the id ensures
        // that the response matches the caller.
        if (response.id !== id) {
          return;
        }

        // At this point, we'll always want to remove listener regardless of result status
        this._worker.removeEventListener('message', listener);

        if (!response.success) {
          // TODO: Do some error handling, not sure what
          __DEBUG_BUILD__ && logger.error('[Replay]', response.response);

          reject(new Error('Error in compression worker'));
          return;
        }

        resolve(response.response as T);
      };

      // Note: we can't use `once` option because it's possible it needs to
      // listen to multiple messages
      this._worker.addEventListener('message', listener);
      this._worker.postMessage({ id, method, arg });
    });
  }

  /**
   * Send the event to the worker.
   */
  private _sendEventToWorker(event: RecordingEvent): Promise<AddEventResult> {
    return this._postMessage<void>({
      id: this._getAndIncrementId(),
      method: 'addEvent',
      arg: JSON.stringify(event),
    });
  }

  /**
   * Finish the request and return the compressed data from the worker.
   */
  private async _finishRequest(id: number): Promise<Uint8Array> {
    const response = await this._postMessage<Uint8Array>({ id, method: 'finish' });

    this.hasEvents = false;

    return response;
  }

  /** Get the current ID and increment it for the next call. */
  private _getAndIncrementId(): number {
    return this._id++;
  }
}
