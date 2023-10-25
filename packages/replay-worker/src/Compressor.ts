import type * as PakoTypes from 'pako';
// @ts-expect-error no types here
import * as pako from 'pako/lib/deflate.js';

const Deflate = (pako as typeof PakoTypes).Deflate;
const deflate = (pako as typeof PakoTypes).deflate;
const constants = (pako as typeof PakoTypes).constants;

/**
 * A stateful compressor that can be used to batch compress events.
 */
export class Compressor {
  /**
   * pako deflator instance
   */
  public deflate: PakoTypes.Deflate;

  /**
   * If any events have been added.
   */
  private _hasEvents: boolean;

  public constructor() {
    this._init();
  }

  /**
   * Clear the compressor buffer.
   */
  public clear(): void {
    this._init();
  }

  /**
   * Add an event to the compressor buffer.
   */
  public addEvent(data: string): void {
    if (!data) {
      throw new Error('Adding invalid event');
    }
    // If the event is not the first event, we need to prefix it with a `,` so
    // that we end up with a list of events
    const prefix = this._hasEvents ? ',' : '';
    // TODO: We may want Z_SYNC_FLUSH or Z_FULL_FLUSH (not sure the difference)
    // Using NO_FLUSH here for now as we can create many attachments that our
    // web UI will get API rate limited.
    this.deflate.push(prefix + data, constants.Z_SYNC_FLUSH);

    this._hasEvents = true;
  }

  /**
   * Finish compression of the current buffer.
   */
  public finish(): Uint8Array {
    // We should always have a list, it can be empty
    this.deflate.push(']', constants.Z_FINISH);

    if (this.deflate.err) {
      throw this.deflate.err;
    }

    // Copy result before we create a new deflator and return the compressed
    // result
    const result = this.deflate.result;

    this._init();

    return result;
  }

  /**
   * Re-initialize the compressor buffer.
   */
  private _init(): void {
    this._hasEvents = false;
    this.deflate = new Deflate();

    // Fake an array by adding a `[`
    this.deflate.push('[', constants.Z_NO_FLUSH);
  }
}

/**
 * Compress a string.
 */
export function compress(data: string): Uint8Array {
  return deflate(data);
}
