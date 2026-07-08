import * as http from 'http';
import * as Sentry from '@sentry/node';

void Sentry.startSpan({ name: 'test_transaction' }, async () => {
  await makeHttpRequest(`${process.env.SERVER_URL}/api/v0`);
});

function makeHttpRequest(url) {
  return new Promise(resolve => {
    http
      .request(url, httpRes => {
        httpRes.on('data', () => {});
        httpRes.on('end', resolve);
      })
      .end();
  });
}
