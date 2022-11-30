/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Compressor } from './Compressor';

const compressor = new Compressor();

interface Handlers {
  init: () => void;
  addEvent: (data: Record<string, unknown>) => void;
  finish: () => void;
}

const handlers: Handlers = {
  init: () => {
    compressor.init();
    return '';
  },

  addEvent: (data: Record<string, unknown>) => {
    compressor.addEvent(data);
    return '';
  },

  finish: () => {
    return compressor.finish();
  },
};

export function handleMessage(e: MessageEvent): void {
  const method = e.data.method as string;
  const id = e.data.id as number;
  const [data] = e.data.args ? JSON.parse(e.data.args) : [];

  // @ts-ignore this syntax is actually fine
  if (method in handlers && typeof handlers[method] === 'function') {
    try {
      // @ts-ignore this syntax is actually fine
      const response = handlers[method](data);
      // @ts-ignore this syntax is actually fine
      postMessage({
        id,
        method,
        success: true,
        response,
      });
    } catch (err) {
      // @ts-ignore this syntax is actually fine
      postMessage({
        id,
        method,
        success: false,
        response: err,
      });

      // eslint-disable-next-line no-console
      console.error(err);
    }
  }
}
