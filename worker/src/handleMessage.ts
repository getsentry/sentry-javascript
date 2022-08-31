import { WorkerRequest } from '../../src/types';

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

export function handleMessage(e: MessageEvent<WorkerRequest>) {
  const method = e.data.method as string;
  const id = e.data.id as number;
  const [data] = e.data.args ? JSON.parse(e.data.args) : [];

  if (method in handlers && typeof handlers[method] === 'function') {
    try {
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
        response: err,
      });
      console.error(err);
    }
  }
}
