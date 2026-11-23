import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import http from 'http';

// Sentry wraps `emit` on the server instance, so the prototype's is the one from before it.
const emitBeforeSentry = http.Server.prototype.emit;

const server = http.createServer((request, response) => {
  if (request.url === '/replace-emit') {
    // Like an app that swaps `emit` for a proxy of the original once the server is up.
    server.emit = new Proxy(emitBeforeSentry, {});
    response.end('replaced');
    return;
  }

  response.end('app');
});

server.listen(0, () => {
  sendPortToRunner(server.address().port);
});
