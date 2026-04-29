import * as Sentry from '@sentry/node';
import http from 'http';

const req = http.get('http://127.0.0.1:9999/external', { timeout: 5000 }, () => {});
req.on('timeout', () => req.destroy());
req.on('error', () => {
  void Sentry.flush();
});
