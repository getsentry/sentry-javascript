import type { ReplayRecordingData } from '@sentry/types';

import type { AddEventResult, EventBuffer, RecordingEvent } from '../types';
import { PartitionedQueue } from './PartitionedQueue';

/**
 * A basic event buffer that does not do any compression.
 * Used as fallback if the compression worker cannot be loaded or is disabled.
 */
export class EventBufferArray implements EventBuffer {
  /** All the events that are buffered to be sent. */
  protected _events: PartitionedQueue<RecordingEvent>;

  public constructor() {
    this._events = new PartitionedQueue<RecordingEvent>();
  }

  /** @inheritdoc */
  public get events(): RecordingEvent[] {
    return this._events.getItems();
  }

  /** @inheritdoc */
  public get hasEvents(): boolean {
    return this._events.getLength() > 0;
  }

  /** @inheritdoc */
  public destroy(): void {
    this._events.clear();
  }

  /** @inheritdoc */
  public async clear(keepLastCheckout?: boolean): Promise<void> {
    this._events.clear(keepLastCheckout);
  }

  /** @inheritdoc */
  public async addEvent(event: RecordingEvent, isCheckout?: boolean): Promise<AddEventResult> {
    this._events.add(event, isCheckout);
  }

  /** @inheritdoc */
  public finish(): Promise<ReplayRecordingData> {
    return new Promise<string>(resolve => {
      // Make a copy of the events array reference and immediately clear the
      // events member so that we do not lose new events while uploading
      // attachment.
      const eventsRet = this.events;
      this._events.clear();
      resolve(JSON.stringify(eventsRet));
    });
  }

  /** @inheritdoc */
  public getEarliestTimestamp(): number | null {
    return this.events.map(event => event.timestamp).sort()[0] || null;
  }
}
