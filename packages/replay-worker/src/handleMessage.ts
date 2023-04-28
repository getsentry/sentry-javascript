import { Compressor } from './Compressor';

interface Handlers {
  clear: (mode?: string) => void;
  addEvent: (data: string) => void;
  finish: () => Uint8Array;
}

class CompressionHandler implements Handlers {
  private _compressor: Compressor;
  private _bufferCompressor?: Compressor;

  public constructor() {
    this._compressor = new Compressor();
  }

  public clear(mode?: string): void {
    /*
      In buffer mode, we want to make sure to always keep the last round of events around.
      So when the time comes and we finish the buffer, we can ensure that we have at least one set of events.
      Without this change, it can happen that you finish right after the last checkout (=clear),
      and thus have no (or very few) events buffered.

      Now, in buffer mode, we basically have to compressors, which are swapped and reset on clear:
      * On first `clear` in buffer mode, we initialize the buffer compressor.
        The regular compressor keeps running as the "current" one
      * On consequitive `clear` calls, we swap the buffer compressor in as the "current" one, and initialize a new buffer compressor
        This will clear any events that were buffered before the _last_ clear call.

      This sadly means we need to keep the buffer twice in memory. But it's a tradeoff we have to make.
    */
    if (mode === 'buffer') {
      // This means it is the first clear in buffer mode - just initialize a new compressor for the alternate compressor
      if (!this._bufferCompressor) {
        this._bufferCompressor = new Compressor();
      } else {
        // Else, swap the alternative compressor in as "normal" compressor, and initialize a new alterntive compressor
        this._compressor = this._bufferCompressor;
        this._bufferCompressor = new Compressor();
      }
      return;
    }

    /*
      In non-buffer mode, we just clear the current compressor (and make sure an eventual buffer compressor is reset)
    */
    this._bufferCompressor = undefined;

    this._compressor.clear();
  }

  public addEvent(data: string): void {
    if (this._bufferCompressor) {
      this._bufferCompressor.addEvent(data);
    }

    return this._compressor.addEvent(data);
  }

  public finish(): Uint8Array {
    if (this._bufferCompressor) {
      this._bufferCompressor.clear();
      this._bufferCompressor = undefined;
    }

    return this._compressor.finish();
  }
}

const handlers = new CompressionHandler();

/**
 * Handler for worker messages.
 */
export function handleMessage(event: MessageEvent): void {
  const data = event.data as {
    method: keyof Handlers;
    id: number;
    arg: string;
  };

  const { method, id, arg } = data;

  if (typeof handlers[method] === 'function') {
    try {
      const response = handlers[method](arg);
      postMessage({
        id,
        method,
        success: true,
        response,
      });
    } catch (err) {
      postMessage({
        id,
        method,
        success: false,
        response: (err as Error).message,
      });

      // eslint-disable-next-line no-console
      console.error(err);
    }
  }
}
