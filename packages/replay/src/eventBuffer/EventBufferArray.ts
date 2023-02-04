import type { AddEventResult, EventBuffer, RecordingEvent } from '../types';
import { EventType } from '@sentry-internal/rrweb';

/**
 * A basic event buffer that does not do any compression.
 * Used as fallback if the compression worker cannot be loaded or is disabled.
 */
export class EventBufferArray implements EventBuffer {
  /** All the events that are buffered to be sent. */
  public events: RecordingEvent[];
  public customEvents: RecordingEvent[];

  public constructor() {
    this.events = [];
    this.customEvents = [];
  }

  /** @inheritdoc */
  public get hasEvents(): boolean {
    return this.events.length > 0 || this.customEvents.length > 0;
  }

  /** @inheritdoc */
  public destroy(): void {
    this.events = [];
    this.customEvents = [];
  }

  /** @inheritdoc */
  public async addEvent(event: RecordingEvent, isCheckout?: boolean): Promise<AddEventResult> {
    if (isCheckout) {
      this.events = [event];
      this.customEvents = [];
      return;
    }

    if (event.type === EventType.Custom) {
      this.customEvents.push(event);
    } else {
      this.events.push(event);
    }

    return;
  }

  /** @inheritdoc */
  public finish(): Promise<string> {
    return new Promise<string>(resolve => {
      // Make a copy of the events array reference and immediately clear the
      // events member so that we do not lose new events while uploading
      // attachment.
      const eventsRet = this.events;
      const customEventsRet = this.customEvents;
      this.events = [];
      this.customEvents = [];
      resolve(`${JSON.stringify(eventsRet)}
${JSON.stringify(customEventsRet)}`);
    });
  }
}
