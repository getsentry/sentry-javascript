/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// TODO: figure out member access types and remove the line above

import { captureException } from '@sentry/core';
import { logger } from '@sentry/utils';

import { RecordingEvent, WorkerRequest, WorkerResponse } from './types';
import workerString from './worker/worker.js';

interface CreateEventBufferParams {
  useCompression: boolean;
}

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

export interface EventBuffer {
  readonly length: number;
  destroy(): void;
  addEvent(event: RecordingEvent, isCheckout?: boolean): void;
  finish(): Promise<string | Uint8Array>;
}

class EventBufferArray implements EventBuffer {
  private events: RecordingEvent[];

  public constructor() {
    this.events = [];
  }

  public destroy(): void {
    this.events = [];
  }

  public get length(): number {
    return this.events.length;
  }

  public addEvent(event: RecordingEvent, isCheckout?: boolean): void {
    if (isCheckout) {
      this.events = [event];
      return;
    }

    this.events.push(event);
  }

  public finish(): Promise<string> {
    return new Promise<string>(resolve => {
      // Make a copy of the events array reference and immediately clear the
      // events member so that we do not lose new events while uploading
      // attachment.
      const eventsRet = this.events;
      this.events = [];
      resolve(JSON.stringify(eventsRet));
    });
  }
}

// exporting for testing
export class EventBufferCompressionWorker implements EventBuffer {
  private worker: null | Worker;
  private eventBufferItemLength: number = 0;
  private id: number = 0;

  public constructor(worker: Worker) {
    this.worker = worker;
  }

  public destroy(): void {
    __DEBUG_BUILD__ && logger.log('[Replay] Destroying compression worker');
    this.worker?.terminate();
    this.worker = null;
  }

  /**
   * Note that this may not reflect what is actually in the event buffer. This
   * is only a local count of the buffer size since `addEvent` is async.
   */
  public get length(): number {
    return this.eventBufferItemLength;
  }

  public async addEvent(event: RecordingEvent, isCheckout?: boolean): Promise<string | Uint8Array> {
    if (isCheckout) {
      // This event is a checkout, make sure worker buffer is cleared before
      // proceeding.
      await this._postMessage({
        id: this._getAndIncrementId(),
        method: 'init',
        args: [],
      });
    }

    return this._sendEventToWorker(event);
  }

  public finish(): Promise<Uint8Array> {
    return this._finishRequest(this._getAndIncrementId());
  }

  /**
   * Post message to worker and wait for response before resolving promise.
   */
  private _postMessage({ id, method, args }: WorkerRequest): Promise<WorkerResponse['response']> {
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
        this.worker?.removeEventListener('message', listener);

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
      this.worker?.addEventListener('message', listener);
      this.worker?.postMessage({ id, method, args: stringifiedArgs });
    });
  }

  private _sendEventToWorker(event: RecordingEvent): Promise<string | Uint8Array> {
    const promise = this._postMessage({
      id: this._getAndIncrementId(),
      method: 'addEvent',
      args: [event],
    });

    // XXX: See note in `get length()`
    this.eventBufferItemLength++;

    return promise;
  }

  private async _finishRequest(id: number): Promise<Uint8Array> {
    const promise = this._postMessage({ id, method: 'finish', args: [] });

    // XXX: See note in `get length()`
    this.eventBufferItemLength = 0;

    return promise as Promise<Uint8Array>;
  }

  private _getAndIncrementId(): number {
    return this.id++;
  }
}
