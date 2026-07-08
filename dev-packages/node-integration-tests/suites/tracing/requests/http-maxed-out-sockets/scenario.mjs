import * as Sentry from '@sentry/node';
import * as http from 'http';

// An agent that only allows a single concurrent socket. The second request is
// queued behind the first, so its socket is not assigned until after the first
// request finishes and its headers have already been serialized via
// `_storeHeader`. Trace-propagation headers must still be injected in this case.
const agent = new http.Agent({ maxSockets: 1, keepAlive: false });

Sentry.startSpan({ name: 'test_span' }, async () => {
  await Promise.all([
    makeHttpRequest(`${process.env.SERVER_URL}/api/request-1`),
    makeHttpRequest(`${process.env.SERVER_URL}/api/request-2`),
  ]);
});

function makeHttpRequest(url) {
  return new Promise(resolve => {
    http
      .request(url, { agent, headers: { connection: 'close' } }, httpRes => {
        httpRes.on('data', () => {
          // we don't care about data
        });
        httpRes.on('end', () => {
          resolve();
        });
      })
      .end();
  });
}
