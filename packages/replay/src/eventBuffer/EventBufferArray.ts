import type { ReplayRecordingData } from '@sentry/types';

import type { EventBuffer, RecordingEvent } from '../types';
import { PartitionedQueue } from './PartitionedQueue';

/**
 * A basic event buffer that does not do any compression.
 * Used as fallback if the compression worker cannot be loaded or is disabled.
 */
export class EventBufferArray implements EventBuffer {
  private _events: PartitionedQueue<RecordingEvent>;

  public constructor() {
    this._events = new PartitionedQueue<RecordingEvent>();
  }

  /** @inheritdoc */
  public get pendingLength(): number {
    return this._events.getLength();
  }

  /** @inheritdoc */
  public get pendingEvents(): RecordingEvent[] {
    return this._events.getItems();
  }

  /** @inheritdoc */
  public getEarliestTimestamp(): number | null {
    return this.pendingEvents.map(event => event.timestamp).sort()[0] || null;
  }

  /** @inheritdoc */
  public destroy(): void {
    this.clear();
  }

  /** @inheritdoc */
  public addEvent(event: RecordingEvent, isCheckout?: boolean): void {
    this._events.add(event, isCheckout);
  }

  /** @inheritdoc */
  public clear(keepLastCheckout?: boolean): void {
    this._events.clear(keepLastCheckout);
  }

  /** @inheritdoc */
  public finish(): Promise<ReplayRecordingData> {
    const { pendingEvents } = this;
    this.clear();

    return Promise.resolve(this._finishRecording(pendingEvents));
  }

  /** Finish in a sync manner. */
  protected _finishRecording(events: RecordingEvent[]): ReplayRecordingData {
    return JSON.stringify(events);
  }
}
