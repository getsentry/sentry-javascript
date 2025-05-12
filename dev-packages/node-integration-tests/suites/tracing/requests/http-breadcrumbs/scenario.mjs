import * as Sentry from '@sentry/node';
import * as http from 'http';

async function run() {
  Sentry.addBreadcrumb({ message: 'manual breadcrumb' });

  await makeHttpRequest(`${process.env.SERVER_URL}/api/v0`);
  await makeHttpGet(`${process.env.SERVER_URL}/api/v1`);
  await makeHttpRequest(`${process.env.SERVER_URL}/api/v2`);
  await makeHttpRequest(`${process.env.SERVER_URL}/api/v3`);

  Sentry.captureException(new Error('foo'));
}

run();

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

function makeHttpGet(url) {
  return new Promise(resolve => {
    http.get(url, httpRes => {
      httpRes.on('data', () => {
        // we don't care about data
      });
      httpRes.on('end', () => {
        resolve();
      });
    });
  });
}
