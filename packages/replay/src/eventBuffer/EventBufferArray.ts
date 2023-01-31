import type { AddEventResult, EventBuffer, RecordingEvent } from '../types';

/**
 * A basic event buffer that does not do any compression.
 * Used as fallback if the compression worker cannot be loaded or is disabled.
 */
export class EventBufferArray implements EventBuffer {
  private _events: RecordingEvent[];

  public constructor() {
    this._events = [];
  }

  /** @inheritdoc */
  public get pendingLength(): number {
    return this._events.length;
  }

  /**
   * Returns the raw events that are buffered. In `EventBufferArray`, this is the
   * same as `this._events`.
   */
  public get pendingEvents(): RecordingEvent[] {
    return this._events;
  }

  /** @inheritdoc */
  public destroy(): void {
    this._events = [];
  }

  /** @inheritdoc */
  public async addEvent(event: RecordingEvent, isCheckout?: boolean): Promise<AddEventResult> {
    if (isCheckout) {
      this._events = [event];
      return;
    }

    this._events.push(event);
    return;
  }

  /** @inheritdoc */
  public finish(): Promise<string> {
    return new Promise<string>(resolve => {
      // Make a copy of the events array reference and immediately clear the
      // events member so that we do not lose new events while uploading
      // attachment.
      const eventsRet = this._events;
      this._events = [];
      resolve(JSON.stringify(eventsRet));
    });
  }
}
