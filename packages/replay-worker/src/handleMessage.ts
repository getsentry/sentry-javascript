/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { compress, Compressor } from './Compressor';

const compressor = new Compressor();

interface Handlers {
  clear: () => void;
  addEvent: (data: string) => void;
  finish: () => Uint8Array;
  compress: (data: string) => Uint8Array;
}

const handlers: Handlers = {
  clear: () => {
    compressor.clear();
  },

  addEvent: (data: string) => {
    return compressor.addEvent(data);
  },

  finish: () => {
    return compressor.finish();
  },

  compress: (data: string) => {
    return compress(data);
  },
};

/**
 * Handler for worker messages.
 */
export function handleMessage(e: MessageEvent): void {
  const method = e.data.method as string;
  const id = e.data.id as number;
  const data = e.data.arg as string;

  // @ts-expect-error this syntax is actually fine
  if (method in handlers && typeof handlers[method] === 'function') {
    try {
      // @ts-expect-error this syntax is actually fine
      const response = handlers[method](data);
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
