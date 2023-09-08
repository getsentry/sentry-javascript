import { handleMessage } from './handleMessage';

addEventListener('message', handleMessage);

// Immediately send a message when worker loads, so we know the worker is ready
// @ts-expect-error this syntax is actually fine
postMessage({
  id: undefined,
  method: 'init',
  success: true,
  response: undefined,
});
