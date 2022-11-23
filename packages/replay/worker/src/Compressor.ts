import { constants, Deflate } from 'pako';

export class Compressor {
  /**
   * pako deflator instance
   */
  public deflate: Deflate;

  /**
   * Number of added events
   */
  public added: number;

  public constructor() {
    this.init();
  }

  public init(): void {
    this.added = 0;
    this.deflate = new Deflate();

    // Fake an array by adding a `[`
    this.deflate.push('[', constants.Z_NO_FLUSH);

    return;
  }

  public addEvent(data: Record<string, any>): void {
    if (!data) {
      return;
    }
    // If the event is not the first event, we need to prefix it with a `,` so
    // that we end up with a list of events
    const prefix = this.added > 0 ? ',' : '';
    // TODO: We may want Z_SYNC_FLUSH or Z_FULL_FLUSH (not sure the difference)
    // Using NO_FLUSH here for now as we can create many attachments that our
    // web UI will get API rate limited.
    this.deflate.push(prefix + JSON.stringify(data), constants.Z_NO_FLUSH);
    this.added++;

    return;
  }

  public finish(): Uint8Array {
    // We should always have a list, it can be empty
    this.deflate.push(']', constants.Z_FINISH);

    if (this.deflate.err) {
      throw this.deflate.err;
    }

    // Copy result before we create a new deflator and return the compressed
    // result
    const result = this.deflate.result;

    this.init();

    return result;
  }
}
