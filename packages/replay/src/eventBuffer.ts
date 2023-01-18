/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// TODO: figure out member access types and remove the line above

import { captureException } from '@sentry/core';
import { logger } from '@sentry/utils';

import type { AddEventResult, EventBuffer, RecordingEvent, WorkerRequest } from './types';
import workerString from './worker/worker.js';

interface CreateEventBufferParams {
  useCompression: boolean;
}

/**
 * Create an event buffer for replays.
 */
export function createEventBuffer({ useCompression }: CreateEventBufferParams): EventBuffer {
  // eslint-disable-next-line no-restricted-globals
  if (useCompression && window.Worker) {
    const workerBlob = new Blob([workerString]);
    const workerUrl = URL.createObjectURL(workerBlob);

    try {
      __DEBUG_BUILD__ && logger.log('[Replay] Using compression worker');
      const worker = new Worker(workerUrl);
      if (worker) {
        return new EventBufferCompressionWorker(worker);
      } else {
        captureException(new Error('Unable to create compression worker'));
      }
    } catch {
      // catch and ignore, fallback to simple event buffer
    }
    __DEBUG_BUILD__ && logger.log('[Replay] Falling back to simple event buffer');
  }

  __DEBUG_BUILD__ && logger.log('[Replay] Using simple buffer');
  return new EventBufferArray();
}

class EventBufferArray implements EventBuffer {
  private _events: RecordingEvent[];

  public constructor() {
    this._events = [];
  }

  public get pendingLength(): number {
    return this._events.length;
  }

  /**
   * Returns the raw events that are buffered. In `EventBufferArray`, this is the
   * same as `this._events`.
   */
  public get pendingEvents(): RecordingEvent[] {
    return this._events;
  }

  public destroy(): void {
    this._events = [];
  }

  public async addEvent(event: RecordingEvent, isCheckout?: boolean): Promise<AddEventResult> {
    if (isCheckout) {
      this._events = [event];
      return;
    }

    this._events.push(event);
    return;
  }

  public finish(): Promise<string> {
    return new Promise<string>(resolve => {
      resolve(this._finish());
    });
  }

  public finishImmediate(): string {
    return this._finish();
  }

  private _finish(): string {
    // Make a copy of the events array reference and immediately clear the
    // events member so that we do not lose new events while uploading
    // attachment.
    const events = this._events;
    this._events = [];
    return JSON.stringify(events);
  }
}

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
   * Finish the event buffer and return the pending events.
   */
  public finishImmediate(): string {
    const events = this._pendingEvents;

    // Ensure worker is still in a good state and disregard the result
    void this._finishRequest(this._getAndIncrementId());

    return JSON.stringify(events);
  }

  /**
   * Post message to worker and wait for response before resolving promise.
   */
  private _postMessage<T>({ id, method, args }: WorkerRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      const listener = ({ data }: MessageEvent) => {
        if (data.method !== method) {
          return;
        }

        // There can be multiple listeners for a single method, the id ensures
        // that the response matches the caller.
        if (data.id !== id) {
          return;
        }

        // At this point, we'll always want to remove listener regardless of result status
        this._worker.removeEventListener('message', listener);

        if (!data.success) {
          // TODO: Do some error handling, not sure what
          __DEBUG_BUILD__ && logger.error('[Replay]', data.response);

          reject(new Error('Error in compression worker'));
          return;
        }

        resolve(data.response);
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
