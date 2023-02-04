import { constants, Deflate } from 'pako';

export class Compressor {
  /**
   * pako deflator instance
   */
  public deflate: Deflate;
  public deflateCustom: Deflate;

  /**
   * If any events have been added.
   */
  private _hasEvents: boolean;
  private _hasCustomEvents: boolean;

  public constructor() {
    this._init();
  }

  public clear(): void {
    this._init();
  }

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

  public addCustomEvent(data: string): void {
    if (!data) {
      throw new Error('Adding invalid event');
    }
    // If the event is not the first event, we need to prefix it with a `,` so
    // that we end up with a list of events
    const prefix = this._hasCustomEvents ? ',' : '';
    // TODO: We may want Z_SYNC_FLUSH or Z_FULL_FLUSH (not sure the difference)
    // Using NO_FLUSH here for now as we can create many attachments that our
    // web UI will get API rate limited.
    this.deflateCustom.push(prefix + data, constants.Z_SYNC_FLUSH);

    this._hasCustomEvents = true;
  }

  public finish(): Uint8Array {
    // We should always have a list, it can be empty
    this.deflate.push(']', constants.Z_FINISH);
    this.deflateCustom.push(']', constants.Z_FINISH);

    if (this.deflate.err) {
      throw this.deflate.err;
    }
    if (this.deflateCustom.err) {
      throw this.deflateCustom.err;
    }

    // Copy result before we create a new deflator and return the compressed
    // result
    const result = this.deflate.result;
    const customResult = this.deflateCustom.result;

    this._init();

    const enc = new TextEncoder();
    const newline = enc.encode(`
`);
    const combinedResult = new Uint8Array(result.length+ newline.length+ customResult.length);
    combinedResult.set(result);
    combinedResult.set(newline, result.length);
    combinedResult.set(customResult, result.length + newline.length);;
    return combinedResult;
  }

  private _init(): void {
    this._hasEvents = false;
    this._hasCustomEvents = false;
    this.deflate = new Deflate();
    this.deflateCustom = new Deflate();

    // Fake an array by adding a `[`
    this.deflate.push('[', constants.Z_NO_FLUSH);
    this.deflateCustom.push('[', constants.Z_NO_FLUSH);
  }
}
