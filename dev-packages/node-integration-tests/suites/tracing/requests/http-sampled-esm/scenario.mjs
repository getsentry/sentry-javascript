import * as http from 'http';
import * as Sentry from '@sentry/node';

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Sentry.startSpan({ name: 'test_span' }, async () => {
  await makeHttpRequest(`${process.env.SERVER_URL}/api/v0`);
  await makeHttpRequest(`${process.env.SERVER_URL}/api/v1`);
  await makeHttpRequest(`${process.env.SERVER_URL}/api/v2`);
  await makeHttpRequest(`${process.env.SERVER_URL}/api/v3`);
});

function makeHttpRequest(url) {
  return new Promise(resolve => {
    http
      .request(url, httpRes => {
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
