import type { AddEventResult, EventBuffer, RecordingEvent } from '../types';

/**
 * A basic event buffer that does not do any compression.
 * Used as fallback if the compression worker cannot be loaded or is disabled.
 */
export class EventBufferArray implements EventBuffer {
  /** All the events that are buffered to be sent. */
  public events: RecordingEvent[];

  public constructor() {
    this.events = [];
  }

  /** @inheritdoc */
  public get hasEvents(): boolean {
    return this.events.length > 0;
  }

  /** @inheritdoc */
  public destroy(): void {
    this.events = [];
  }

  /** @inheritdoc */
  public async addEvent(event: RecordingEvent, isCheckout?: boolean): Promise<AddEventResult> {
    if (isCheckout) {
      this.events = [event];
      return;
    }

    this.events.push(event);
    return;
  }

  /** @inheritdoc */
  public finish(): Promise<string> {
    return new Promise<string>(resolve => {
      // Make a copy of the events array reference and immediately clear the
      // events member so that we do not lose new events while uploading
      // attachment.
      const eventsRet = this.events;
      this.events = [];
      resolve(JSON.stringify(eventsRet));
    });
  }
}
