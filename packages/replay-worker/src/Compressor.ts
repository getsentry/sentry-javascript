import { compressSync, EncodeUTF8, strToU8, Zlib } from 'fflate';

/**
 * A stateful compressor that can be used to batch compress events.
 */
export class Compressor {
  public stream: EncodeUTF8;
  public deflate: Zlib;

  private _deflatedData: Uint8Array[];

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

    this.stream.push(prefix + data);

    this._hasEvents = true;
  }

  /**
   * Finish compression of the current buffer.
   */
  public finish(): Uint8Array {
    // We should always have a list, it can be empty
    this.stream.push(']', true);

    // Copy result before we create a new deflator and return the compressed
    // result
    const result = mergeUInt8Arrays(this._deflatedData);

    this._init();

    return result;
  }

  /**
   * Re-initialize the compressor buffer.
   */
  private _init(): void {
    this._hasEvents = false;
    this._deflatedData = [];

    this.deflate = new Zlib();

    this.deflate.ondata = (data, _final) => {
      this._deflatedData.push(data);
    };

    this.stream = new EncodeUTF8((data, final) => {
      this.deflate.push(data, final);
    });

    // Fake an array by adding a `[`
    this.stream.push('[');
  }
}

/**
 * Compress a string.
 */
export function compress(data: string): Uint8Array {
  return compressSync(strToU8(data));
}

function mergeUInt8Arrays(chunks: Uint8Array[]): Uint8Array {
  // calculate data length
  let len = 0;

  for (const chunk of chunks) {
    len += chunk.length;
  }

  // join chunks
  const result = new Uint8Array(len);

  for (let i = 0, pos = 0, l = chunks.length; i < l; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const chunk = chunks[i]!;
    result.set(chunk, pos);
    pos += chunk.length;
  }

  return result;
}
