import { logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import type { WorkerRequest, WorkerResponse } from '../types';
import { logInfo } from '../util/log';

/**
 * Event buffer that uses a web worker to compress events.
 * Exported only for testing.
 */
export class WorkerHandler {
  private _worker: Worker;
  private _id: number;
  private _ensureReadyPromise?: Promise<void>;

  public constructor(worker: Worker) {
    this._worker = worker;
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
   * Destroy the worker.
   */
  public destroy(): void {
    logInfo('[Replay] Destroying compression worker');
    this._worker.terminate();
  }

  /**
   * Post message to worker and wait for response before resolving promise.
   */
  public postMessage<T>(method: WorkerRequest['method'], arg?: WorkerRequest['arg']): Promise<T> {
    const id = this._getAndIncrementId();

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
          DEBUG_BUILD && logger.error('[Replay]', response.response);

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

  /** Get the current ID and increment it for the next call. */
  private _getAndIncrementId(): number {
    return this._id++;
  }
}
