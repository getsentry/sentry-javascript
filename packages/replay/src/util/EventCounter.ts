import { EVENT_ROLLING_WINDOW_MAX, EVENT_ROLLING_WINDOW_TIME } from '../constants';

/** A simple rolling window event counter. */
export class EventCounter {
  // How many events happed in a rolling window of 100ms
  private _count: number;
  // How long the rolling window is
  private _time: number;
  // How many events can happen in the rolling window
  private _max: number;

  public constructor(time = EVENT_ROLLING_WINDOW_TIME, max = EVENT_ROLLING_WINDOW_MAX) {
    this._count = 0;
    this._time = time;
    this._max = max;
  }

  /** An event is added. */
  public add(): void {
    this._count++;

    setTimeout(() => this._count--, this._time);
  }

  /** If there are too many events in the rolling window. */
  public hasExceededLimit(): boolean {
    return this._count > this._max;
  }
}
