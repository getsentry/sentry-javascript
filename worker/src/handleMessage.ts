import { Compressor } from './Compressor';
import { WorkerRequest } from '../../src/types';

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
  const [data] = e.data.args || [];

  if (method in handlers && typeof handlers[method] === 'function') {
    try {
      const response = handlers[method](data);
      postMessage({
        method,
        success: true,
        response,
      });
    } catch (err) {
      postMessage({
        method,
        success: false,
        response: err,
      });
      console.error(err);
    }
  }
}
