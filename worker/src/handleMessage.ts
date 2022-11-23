/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Compressor } from './Compressor';

const compressor = new Compressor();

const handlers: Record<string, (args: any[]) => void> = {
  init: () => {
    compressor.init();
    return '';
  },

  addEvent: (data: Record<string, any>) => {
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

  if (method in handlers && typeof handlers[method] === 'function') {
    try {
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
      console.error(err);
    }
  }
}
