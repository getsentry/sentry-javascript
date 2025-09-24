import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import http from 'http';

const server = http.createServer(function (request, response) {
  const useProxy = request.url.includes('proxy');
  const patchOriginalEmit = request.url.includes('original');

  // Monkey patch it again to ensure it still works later
  // We cover multiple possible scenarios here:
  // 1. Use proxy to overwrite server.emit
  // 2. Use proxy to overwrite server.emit, using initial server.emit
  // 3. Use classic monkey patching to overwrite server.emit
  // 4. Use classic monkey patching to overwrite server.emit, using initial server.emit
  monkeyPatchEmit(server, { useProxy, patchOriginalEmit });

  response.end('Hello Node.js Server!');
});

const initialServerEmit = server.emit;

server.listen(0, () => {
  sendPortToRunner(server.address().port);
});

function monkeyPatchEmit(server, { useProxy = false, patchOriginalEmit = false }) {
  const originalEmit = patchOriginalEmit ? initialServerEmit : server.emit;

  if (useProxy) {
    server.emit = new Proxy(originalEmit, {
      apply(target, thisArg, args) {
        return target.apply(thisArg, args);
      },
    });
  } else {
    server.emit = function () {
      return originalEmit.apply(server, arguments);
    };
  }
}
