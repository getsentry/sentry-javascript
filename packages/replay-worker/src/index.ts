import workerString from './worker';

/**
 * Get the URL for a web worker.
 */
export function getWorkerURL(): string {
  const workerBlob = new Blob([workerString], { type: 'text/javascript' });
  // will execute it as a classic Worker script. A Blob created without an
  // explicit `type` defaults to an empty string, which WebKit may reject,
  // firing a bare `error` event with no message. Blink/Gecko are lenient here,
  // so this only manifests on Safari. Set an explicit JavaScript MIME type so
  // the worker loads across browsers.
  const workerBlob = new Blob([workerString], { type: 'text/javascript' });
  return URL.createObjectURL(workerBlob);
}
