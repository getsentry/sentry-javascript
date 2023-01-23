import type { ReplayRecordingData } from '@sentry/types';
import { logger } from '@sentry/utils';

import type { AddEventResult, EventBuffer, RecordingEvent } from '../types';
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

  public constructor(worker: Worker) {
    this._fallback = new EventBufferArray();
    this._compression = new EventBufferCompressionWorker(worker);
    this._used = this._fallback;

    void this._ensureWorkerIsLoaded();
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

  /**
   * Add an event to the event buffer.
   *
   * Returns true if event was successfully added.
   */
  public addEvent(event: RecordingEvent, isCheckout?: boolean): Promise<AddEventResult> {
    return this._used.addEvent(event, isCheckout);
  }

  /** @inheritDoc */
  public finish(): Promise<ReplayRecordingData> {
    return this._used.finish();
  }

  /** Ensure the worker has loaded. */
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
    const addEventPromises: Promise<void>[] = [];
    for (const event of this._fallback.pendingEvents) {
      addEventPromises.push(this._compression.addEvent(event));
    }

    // We switch over to the compression buffer immediately - any further events will be added
    // after the previously buffered ones
    this._used = this._compression;

    // Wait for original events to be re-added before resolving
    await Promise.all(addEventPromises);
  }
}
