import * as http from 'http';
import * as Sentry from '@sentry/node';

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Sentry.startSpan({ name: 'test_transaction' }, async () => {
  await makeHttpRequest(`${process.env.SERVER_URL}/api/v0/users?id=1#fragment`);
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
