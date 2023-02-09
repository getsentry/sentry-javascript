import type { ReplayRecordingData } from '@sentry/types';
import { logger } from '@sentry/utils';

import type { AddEventResult, EventBuffer, RecordingEvent } from '../types';
import { EventBufferArray } from './EventBufferArray';
import { EventBufferCompressionWorker } from './EventBufferCompressionWorker';
import { EventBufferPartitionedCompressionWorker } from './EventBufferPartitionedCompressionWorker';

/**
 * This proxy will try to use the compression worker, and fall back to use the simple buffer if an error occurs there.
 * This can happen e.g. if the worker cannot be loaded.
 * Exported only for testing.
 */
export class EventBufferProxy implements EventBuffer {
  private _fallback: EventBufferArray;
  private _compression: EventBufferCompressionWorker | EventBufferPartitionedCompressionWorker;
  private _used: EventBuffer;
  private _ensureWorkerIsLoadedPromise: Promise<void>;

  public constructor(worker: Worker, keepLastCheckout: boolean) {
    this._fallback = new EventBufferArray();

    // In error mode, we use the partitioned compression worker, which does not use compression streaming
    // Instead, all events are sent at finish-time, as we need to continuously modify the queued events
    // In session mode, we use a streaming compression implementation, which is more performant
    this._compression = keepLastCheckout
      ? new EventBufferPartitionedCompressionWorker(worker)
      : new EventBufferCompressionWorker(worker);

    this._used = this._fallback;
    this._ensureWorkerIsLoadedPromise = this._ensureWorkerIsLoaded();
  }

  /** @inheritDoc */
  public get hasEvents(): boolean {
    return this._used.hasEvents;
  }

  /** @inheritDoc */
  public destroy(): void {
    this._fallback.destroy();
    this._compression.destroy();
  }

  /**
   * Add an event to the event buffer.
   *
   * Returns true if event was successfully added.
   */
  public addEvent(event: RecordingEvent, isCheckout?: boolean): Promise<AddEventResult> {
    return this._used.addEvent(event, isCheckout);
  }

  /** @inheritDoc */
  public async finish(): Promise<ReplayRecordingData> {
    // Ensure the worker is loaded, so the sent event is compressed
    await this.ensureWorkerIsLoaded();

    return this._used.finish();
  }

  /** @inheritdoc */
  public clear(keepLastCheckout?: boolean): Promise<void> {
    return this._used.clear(keepLastCheckout);
  }

  /** Ensure the worker has loaded. */
  public ensureWorkerIsLoaded(): Promise<void> {
    return this._ensureWorkerIsLoadedPromise;
  }

  /** @inheritdoc */
  public getEarliestTimestamp(): number | null {
    return this._used.getEarliestTimestamp();
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

    // Now we need to switch over the array buffer to the compression worker
    await this._switchToCompressionWorker();
  }

  /** Switch the used buffer to the compression worker. */
  private async _switchToCompressionWorker(): Promise<void> {
    const { events } = this._fallback;

    const addEventPromises: Promise<void>[] = [];
    for (const event of events) {
      addEventPromises.push(this._compression.addEvent(event));
    }

    // We switch over to the new buffer immediately - any further events will be added
    // after the previously buffered ones
    this._used = this._compression;

    // Wait for original events to be re-added before resolving
    try {
      await Promise.all(addEventPromises);
    } catch (error) {
      __DEBUG_BUILD__ && logger.warn('[Replay] Failed to add events when switching buffers.', error);
    }
  }
}
