import type { ReplayRecordingData } from '@sentry/types';
import { logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import type { AddEventResult, EventBuffer, EventBufferType, RecordingEvent } from '../types';
import { logInfo } from '../util/log';
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

  /** @inheritdoc */
  public get type(): EventBufferType {
    return this._used.type;
  }

  /** @inheritDoc */
  public get hasEvents(): boolean {
    return this._used.hasEvents;
  }

  /** @inheritdoc */
  public get hasCheckout(): boolean {
    return this._used.hasCheckout;
  }
  /** @inheritdoc */
  public set hasCheckout(value: boolean) {
    this._used.hasCheckout = value;
  }

  /** @inheritDoc */
  public destroy(): void {
    this._fallback.destroy();
    this._compression.destroy();
  }

  /** @inheritdoc */
  public clear(): void {
    return this._used.clear();
  }

  /** @inheritdoc */
  public getEarliestTimestamp(): number | null {
    return this._used.getEarliestTimestamp();
  }

  /**
   * Add an event to the event buffer.
   *
   * Returns true if event was successfully added.
   */
  public addEvent(event: RecordingEvent): Promise<AddEventResult> {
    return this._used.addEvent(event);
  }

  /** @inheritDoc */
  public async finish(): Promise<ReplayRecordingData> {
    // Ensure the worker is loaded, so the sent event is compressed
    await this.ensureWorkerIsLoaded();

    return this._used.finish();
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
      logInfo('[Replay] Failed to load the compression worker, falling back to simple buffer');
      return;
    }

    // Now we need to switch over the array buffer to the compression worker
    await this._switchToCompressionWorker();
  }

  /** Switch the used buffer to the compression worker. */
  private async _switchToCompressionWorker(): Promise<void> {
    const { events, hasCheckout } = this._fallback;

    const addEventPromises: Promise<void>[] = [];
    for (const event of events) {
      addEventPromises.push(this._compression.addEvent(event));
    }

    this._compression.hasCheckout = hasCheckout;

    // We switch over to the new buffer immediately - any further events will be added
    // after the previously buffered ones
    this._used = this._compression;

    // Wait for original events to be re-added before resolving
    try {
      await Promise.all(addEventPromises);
    } catch (error) {
      DEBUG_BUILD && logger.warn('[Replay] Failed to add events when switching buffers.', error);
    }
  }
}
