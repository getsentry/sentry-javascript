import * as Sentry from '@sentry/node';
import * as http from 'http';

// Another SDK in this process (e.g. the Next.js Edge Runtime SDK) sends to Sentry without suppressing our tracing
const sentryUrl = `${process.env.SERVER_URL}/api/1337/envelope/?sentry_version=7&sentry_key=public&sentry_client=other`;

Sentry.startSpan({ name: 'test_span' }, async () => {
  await makeHttpRequest(sentryUrl);
  await makeHttpRequest(`${process.env.SERVER_URL}/api/v0`);
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
