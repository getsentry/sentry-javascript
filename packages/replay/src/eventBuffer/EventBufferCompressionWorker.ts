import { logger } from '@sentry/utils';

import type { AddEventResult, EventBuffer, RecordingEvent, WorkerRequest, WorkerResponse } from '../types';

/**
 * Event buffer that uses a web worker to compress events.
 * Exported only for testing.
 */
export class EventBufferCompressionWorker implements EventBuffer {
  /**
   * Keeps track of the list of events since the last flush that have not been compressed.
   * For example, page is reloaded and a flush attempt is made, but
   * `finish()` (and thus the flush), does not complete.
   */
  public _pendingEvents: RecordingEvent[] = [];

  private _worker: Worker;
  private _eventBufferItemLength: number = 0;
  private _id: number = 0;

  public constructor(worker: Worker) {
    this._worker = worker;
  }

  /**
   * The number of raw events that are buffered. This may not be the same as
   * the number of events that have been compresed in the worker because
   * `addEvent` is async.
   */
  public get pendingLength(): number {
    return this._eventBufferItemLength;
  }

  /**
   * Returns a list of the raw recording events that are being compressed.
   */
  public get pendingEvents(): RecordingEvent[] {
    return this._pendingEvents;
  }

  /**
   * Ensure the worker is ready (or not).
   * This will either resolve when the worker is ready, or reject if an error occured.
   */
  public ensureReady(): Promise<void> {
    return new Promise((resolve, reject) => {
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
    if (isCheckout) {
      // This event is a checkout, make sure worker buffer is cleared before
      // proceeding.
      await this._postMessage({
        id: this._getAndIncrementId(),
        method: 'init',
        args: [],
      });
    }

    // Don't store checkout events in `_pendingEvents` because they are too large
    if (!isCheckout) {
      this._pendingEvents.push(event);
    }

    return this._sendEventToWorker(event);
  }

  /**
   * Finish the event buffer and return the compressed data.
   */
  public finish(): Promise<Uint8Array> {
    return this._finishRequest(this._getAndIncrementId());
  }

  /**
   * Post message to worker and wait for response before resolving promise.
   */
  private _postMessage<T>({ id, method, args }: WorkerRequest): Promise<T> {
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

      let stringifiedArgs;
      try {
        stringifiedArgs = JSON.stringify(args);
      } catch (err) {
        __DEBUG_BUILD__ && logger.error('[Replay] Error when trying to stringify args', err);
        stringifiedArgs = '[]';
      }

      // Note: we can't use `once` option because it's possible it needs to
      // listen to multiple messages
      this._worker.addEventListener('message', listener);
      this._worker.postMessage({ id, method, args: stringifiedArgs });
    });
  }

  /**
   * Send the event to the worker.
   */
  private async _sendEventToWorker(event: RecordingEvent): Promise<AddEventResult> {
    const promise = this._postMessage<void>({
      id: this._getAndIncrementId(),
      method: 'addEvent',
      args: [event],
    });

    // XXX: See note in `get length()`
    this._eventBufferItemLength++;

    return promise;
  }

  /**
   * Finish the request and return the compressed data from the worker.
   */
  private async _finishRequest(id: number): Promise<Uint8Array> {
    const promise = this._postMessage<Uint8Array>({ id, method: 'finish', args: [] });

    // XXX: See note in `get length()`
    this._eventBufferItemLength = 0;

    await promise;

    this._pendingEvents = [];

    return promise;
  }

  /** Get the current ID and increment it for the next call. */
  private _getAndIncrementId(): number {
    return this._id++;
  }
}
