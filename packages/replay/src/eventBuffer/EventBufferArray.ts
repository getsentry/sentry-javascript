import type { ReplayRecordingData } from '@sentry/types';

import type { EventBuffer, RecordingEvent } from '../types';

interface EventsGroup {
  checkoutTimestamp: number;
  events: RecordingEvent[];
}

/**
 * A basic event buffer that does not do any compression.
 * Used as fallback if the compression worker cannot be loaded or is disabled.
 */
export class EventBufferArray implements EventBuffer {
  private _events: EventsGroup[];
  private _eventsFlat: RecordingEvent[];

  public constructor() {
    this._events = [];
    this._eventsFlat = [];
  }

  /** @inheritdoc */
  public get pendingLength(): number {
    return this.pendingEvents.length;
  }

  /** @inheritdoc */
  public get pendingEvents(): RecordingEvent[] {
    return this._eventsFlat;
    // return this._events.reduce((acc, { events }) => [...events, ...acc], [] as RecordingEvent[]);
  }

  /** @inheritdoc */
  public getFirstCheckoutTimestamp(): number | null {
    return (this._events[0] && this._events[0].checkoutTimestamp) || null;
  }

  /** @inheritdoc */
  public destroy(): void {
    this.clear();
  }

  /** @inheritdoc */
  public addEvent(event: RecordingEvent, isCheckout?: boolean): void {
    if (isCheckout || this._events.length === 0) {
      const group: EventsGroup = {
        checkoutTimestamp: event.timestamp,
        events: [event],
      };
      this._events.unshift(group);
    } else {
      this._events[0].events.push(event);
    }

    this._eventsFlat.push(event);
  }

  /** @inheritdoc */
  public clear(keepLastCheckout?: boolean): void {
    if (keepLastCheckout) {
      this._events.splice(1);

      if (this._events.length === 0) {
        this._eventsFlat = [];
      } else {
        // Remove all events from the flat array that are not in the first group
        const firstGroup = this._events[0];
        this._eventsFlat = this._eventsFlat.filter(event => firstGroup.events.includes(event));
      }
    } else {
      this._events = [];
      this._eventsFlat = [];
    }
  }

  /** @inheritdoc */
  public finish(): Promise<ReplayRecordingData> {
    const pendingEvents = this.pendingEvents.slice();
    this.clear();

    return Promise.resolve(this._finishRecording(pendingEvents));
  }

  /** Finish in a sync manner. */
  protected _finishRecording(events: RecordingEvent[]): ReplayRecordingData {
    return JSON.stringify(events);
  }
}
