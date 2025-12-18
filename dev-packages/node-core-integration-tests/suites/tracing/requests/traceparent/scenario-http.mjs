import * as Sentry from '@sentry/node-core';
import * as http from 'http';

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

await Sentry.startSpan({ name: 'outer' }, async () => {
  await makeHttpRequest(`${process.env.SERVER_URL}/api/v1`);
});
