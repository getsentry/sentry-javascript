import * as Sentry from '@sentry/node';
import http from 'http';
http.get('http://localhost:9999/external', () => {}).on('error', () => {
  void Sentry.flush();
});
