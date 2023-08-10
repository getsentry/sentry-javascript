import { REPLAY_MAX_EVENT_BUFFER_SIZE } from '../constants';
import type { AddEventResult, EventBuffer, EventBufferType, RecordingEvent } from '../types';
import { timestampToMs } from '../util/timestamp';
import { EventBufferSizeExceededError } from './error';

/**
 * A basic event buffer that does not do any compression.
 * Used as fallback if the compression worker cannot be loaded or is disabled.
 */
export class EventBufferArray implements EventBuffer {
  /** All the events that are buffered to be sent. */
  public events: RecordingEvent[];

  /** @inheritdoc */
  public hasCheckout: boolean;

  private _totalSize: number;

  public constructor() {
    this.events = [];
    this._totalSize = 0;
    this.hasCheckout = false;
  }

  /** @inheritdoc */
  public get hasEvents(): boolean {
    return this.events.length > 0;
  }

  /** @inheritdoc */
  public get type(): EventBufferType {
    return 'sync';
  }

  /** @inheritdoc */
  public destroy(): void {
    this.events = [];
  }

  /** @inheritdoc */
  public async addEvent(event: RecordingEvent): Promise<AddEventResult> {
    const eventSize = JSON.stringify(event).length;
    this._totalSize += eventSize;
    if (this._totalSize > REPLAY_MAX_EVENT_BUFFER_SIZE) {
      throw new EventBufferSizeExceededError();
    }

    this.events.push(event);
  }

  /** @inheritdoc */
  public finish(): Promise<string> {
    return new Promise<string>(resolve => {
      // Make a copy of the events array reference and immediately clear the
      // events member so that we do not lose new events while uploading
      // attachment.
      const eventsRet = this.events;
      this.clear();
      resolve(JSON.stringify(eventsRet));
    });
  }

  /** @inheritdoc */
  public clear(): void {
    this.events = [];
    this._totalSize = 0;
    this.hasCheckout = false;
  }

  /** @inheritdoc */
  public getEarliestTimestamp(): number | null {
    const timestamp = this.events.map(event => event.timestamp).sort()[0];

    if (!timestamp) {
      return null;
    }

    return timestampToMs(timestamp);
  }
}
