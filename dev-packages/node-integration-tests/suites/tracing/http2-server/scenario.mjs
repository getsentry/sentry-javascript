import * as Sentry from '@sentry/node';
import http2 from 'node:http2';

const server = http2.createServer((request, response) => {
  if (request.url === '/error') {
    Sentry.captureException(new Error('error in http2 handler'));
    response.statusCode = 500;
    response.end();
    return;
  }

  Sentry.startSpan({ name: 'handler-work' }, () => {});
  response.end('ok');
});

function request(client, headers) {
  return new Promise((resolve, reject) => {
    const stream = client.request(headers);
    stream.on('error', reject);
    stream.on('data', () => {});
    stream.on('end', resolve);
    stream.end();
  });
}

server.listen(0, async () => {
  const client = http2.connect(`http://localhost:${server.address().port}`);

  await request(client, {
    ':path': '/users/42?q=1',
    'sentry-trace': '12312012123120121231201212312012-1121201211212012-1',
    baggage: 'sentry-release=2.1.0,sentry-environment=myEnv',
  });
  await request(client, { ':path': '/error' });

  client.close();
  server.close();
});
