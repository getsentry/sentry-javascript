import type { ReplayRecordingData } from '@sentry/types';
import { logger } from '@sentry/utils';

import type { EventBuffer, RecordingEvent } from '../types';
import { EventBufferArray } from './EventBufferArray';
import { EventBufferCompressionWorker } from './EventBufferCompressionWorker';

/**
 * This proxy will try to use the compression worker, and fall back to use the simple buffer if an error occurs there.
 * This can happen e.g. if the worker cannot be loaded.
 * Exported only for testing.
 */
export class EventBufferProxy implements EventBuffer {
  private _fallback: EventBufferArray;
  private _compression: EventBufferCompressionWorker;
  private _used: EventBuffer;
  private _ensureWorkerIsLoadedPromise: Promise<void>;

  public constructor(worker: Worker) {
    this._fallback = new EventBufferArray();
    this._compression = new EventBufferCompressionWorker(worker);
    this._used = this._fallback;

    this._ensureWorkerIsLoadedPromise = this._ensureWorkerIsLoaded();
  }

  /** @inheritDoc */
  public get pendingLength(): number {
    return this._used.pendingLength;
  }

  /** @inheritDoc */
  public get pendingEvents(): RecordingEvent[] {
    return this._used.pendingEvents;
  }

  /** @inheritDoc */
  public destroy(): void {
    this._fallback.destroy();
    this._compression.destroy();
  }

  /** @inheritdoc */
  public addEvent(event: RecordingEvent, isCheckout?: boolean): void {
    return this._used.addEvent(event, isCheckout);
  }

  /** @inheritdoc */
  public clear(keepLastCheckout?: boolean): void {
    return this._used.clear(keepLastCheckout);
  }

  /** @inheritDoc */
  public async finish(): Promise<ReplayRecordingData> {
    // Ensure the worker is loaded, so the sent event is compressed
    await this.ensureWorkerIsLoaded();

    return this._used.finish();
  }

  /** @inheritdoc */
  public getFirstCheckoutTimestamp(): number | null {
    return this._used.getFirstCheckoutTimestamp();
  }

  /** Ensure the worker has loaded. */
  public ensureWorkerIsLoaded(): Promise<void> {
    return this._ensureWorkerIsLoadedPromise;
  }

  /** Actually check if the worker has been loaded. */
  private async _ensureWorkerIsLoaded(): Promise<void> {
    try {
      await this._compression.ensureReady();
    } catch (error) {
      // If the worker fails to load, we fall back to the simple buffer.
      // Nothing more to do from our side here
      __DEBUG_BUILD__ && logger.log('[Replay] Failed to load the compression worker, falling back to simple buffer');
      return;
    }

    // Compression worker is ready, we can use it
    // Now we need to switch over the array buffer to the compression worker
    for (const event of this._fallback.pendingEvents) {
      this._compression.addEvent(event);
    }

    // We switch over to the compression buffer immediately - any further events will be added
    // after the previously buffered ones
    this._used = this._compression;

    this._fallback.clear();
  }
}
