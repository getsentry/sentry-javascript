import * as Sentry from '@sentry/node';
import http from 'http';

// Use 127.0.0.1 directly to avoid IPv6 DNS resolution delays on CI (Ubuntu).
// localhost may resolve to ::1 first, causing the connection to hang.
http.get('http://127.0.0.1:9999/external', () => {}).on('error', () => {
  void Sentry.flush();
});
