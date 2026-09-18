import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import http from 'http';

// A bare `node:http` server: no framework ever resolves a route, so the server span
// keeps whatever name it was given at span start.
const server = http.createServer((_request, response) => {
  response.end('Hello Node.js Server!');
});

server.listen(0, () => {
  sendPortToRunner(server.address().port);
});
