import * as Sentry from '@sentry/node';
import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import http from 'http';

const server = http.createServer((request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');

  if (pathname === '/named') {
    Sentry.updateSpanName(Sentry.getRootSpan(Sentry.getActiveSpan()), 'named-segment');
  }

  makeHttpRequest(`${process.env.SERVER_URL}/outgoing`).then(() => {
    if (pathname === '/error') {
      Sentry.captureException(new Error('test error'));
    }
    response.end('ok');
  });
});

server.listen(0, () => {
  sendPortToRunner(server.address().port);
});

function makeHttpRequest(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, httpRes => {
      httpRes.resume();
      httpRes.on('end', resolve);
    });
    request.on('error', reject);
  });
}
