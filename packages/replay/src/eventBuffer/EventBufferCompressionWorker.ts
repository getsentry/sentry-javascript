import type { ReplayRecordingData } from '@sentry/types';
import { logger } from '@sentry/utils';

import type { RecordingEvent, WorkerRequest, WorkerResponse } from '../types';
import { EventBufferArray } from './EventBufferArray';

/**
 * Event buffer that uses a web worker to compress events.
 * Exported only for testing.
 */
export class EventBufferCompressionWorker extends EventBufferArray {
  private _worker: Worker;

  private _id: number = 0;
  private _ensureReadyPromise?: Promise<void>;

  public constructor(worker: Worker) {
    super();
    this._worker = worker;
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

  /** @inheritdoc */
  public destroy(): void {
    __DEBUG_BUILD__ && logger.log('[Replay] Destroying compression worker');
    this._worker.terminate();
    super.destroy();
  }

  /**
   * Finish the event buffer and return the compressed data.
   */
  public async finish(): Promise<ReplayRecordingData> {
    const pendingEvents = this.pendingEvents.slice();

    this.clear();

    try {
      return await this._compressEvents(this._getAndIncrementId(), pendingEvents);
    } catch (error) {
      __DEBUG_BUILD__ && logger.error('[Replay] Error when trying to compress events', error);
      // fall back to uncompressed
      return this._finishRecording(pendingEvents);
    }
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
   * Finish the request and return the compressed data from the worker.
   */
  private async _compressEvents(id: number, events: RecordingEvent[]): Promise<Uint8Array> {
    return this._postMessage<Uint8Array>({ id, method: 'compress', arg: JSON.stringify(events) });
  }

  /** Get the current ID and increment it for the next call. */
  private _getAndIncrementId(): number {
    return this._id++;
  }
}
