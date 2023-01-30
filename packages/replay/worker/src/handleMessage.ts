import { compress } from './compress';

interface Handlers {
  compress: (data: string) => void;
}

const handlers: Handlers = {
  compress: (data: string) => {
    return compress(data);
  },
};

export function handleMessage(e: MessageEvent): void {
  const eventData = e.data as unknown as { method: string; id: number; arg: string };
  const { method, id, arg } = eventData;

  // @ts-ignore this syntax is actually fine
  if (method in handlers && typeof handlers[method] === 'function') {
    try {
      // @ts-ignore this syntax is actually fine
      const response = handlers[method](arg);
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
        response: (err as Error).message,
      });

      // eslint-disable-next-line no-console
      console.error(err);
    }
  }
}
