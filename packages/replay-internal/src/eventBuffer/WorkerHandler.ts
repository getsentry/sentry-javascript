import { DEBUG_BUILD } from '../debug-build';
import type { WorkerRequest, WorkerResponse } from '../types';
import { debug } from '../util/logger';

interface PendingRequest {
  method: WorkerRequest['method'];
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/**
 * Event buffer that uses a web worker to compress events.
 * Exported only for testing.
 */
export class WorkerHandler {
  private _worker: Worker;
  private _id: number;
  private _ensureReadyPromise?: Promise<void>;
  private _pending: Map<number, PendingRequest>;

  public constructor(worker: Worker) {
    this._worker = worker;
    this._id = 0;
    this._pending = new Map();
    // A single long-lived listener routes responses by id. Per-request
    // listeners would make worker dispatch O(n) per response, so a burst of N
    // in-flight requests becomes O(n^2) main-thread work.
    this._worker.addEventListener('message', this._onMessage);
  }

  /**
   * Ensure the worker is ready (or not).
   * This will either resolve when the worker is ready, or reject if an error occurred.
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
            DEBUG_BUILD && debug.warn('Received worker message with unsuccessful status', data);
            reject(new Error('Received worker message with unsuccessful status'));
          }
        },
        { once: true },
      );

      this._worker.addEventListener(
        'error',
        error => {
          DEBUG_BUILD && debug.warn('Failed to load Replay compression worker', error);
          reject(
            new Error(
              `Failed to load Replay compression worker: ${error instanceof ErrorEvent && error.message ? error.message : 'Unknown error. This can happen due to CSP policy restrictions, network issues, or the worker script failing to load.'}`,
            ),
          );
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
    DEBUG_BUILD && debug.log('Destroying compression worker');
    this._worker.removeEventListener('message', this._onMessage);
    this._pending.forEach(pending => pending.reject(new Error('Worker destroyed')));
    this._pending.clear();
    this._worker.terminate();
  }

  /**
   * Post message to worker and wait for response before resolving promise.
   */
  public postMessage<T>(method: WorkerRequest['method'], arg?: WorkerRequest['arg']): Promise<T> {
    const id = this._getAndIncrementId();

    return new Promise<T>((resolve, reject) => {
      this._pending.set(id, {
        method,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      try {
        this._worker.postMessage({ id, method, arg });
      } catch (error) {
        // If postMessage throws synchronously (e.g. DataCloneError, worker
        // already terminated), drop the pending entry so it doesn't leak.
        this._pending.delete(id);
        reject(error);
      }
    });
  }

  private _onMessage = ({ data }: MessageEvent): void => {
    const response = data as WorkerResponse;
    // The worker emits an init message with `id: undefined` on load, which is
    // handled by `ensureReady()` via its own listener. Ignore anything that
    // doesn't carry a numeric id we issued.
    if (typeof response.id !== 'number') {
      return;
    }
    const pending = this._pending.get(response.id);
    if (!pending || pending.method !== response.method) {
      return;
    }

    this._pending.delete(response.id);

    if (!response.success) {
      DEBUG_BUILD && debug.error('Error in compression worker: ', response.response);
      pending.reject(new Error('Error in compression worker'));
      return;
    }

    pending.resolve(response.response);
  };

  /** Get the current ID and increment it for the next call. */
  private _getAndIncrementId(): number {
    return this._id++;
  }
}
