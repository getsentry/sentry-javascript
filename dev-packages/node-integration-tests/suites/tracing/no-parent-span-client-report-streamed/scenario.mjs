import * as Sentry from '@sentry/node';
import http from 'http';
http.get('http://localhost:9999/external', () => {}).on('error', () => {});

// Wait briefly for the span to end, then flush the span buffer.
// The span buffer uses an unref'd timeout, so without an explicit flush
// the process would exit before the buffer drains.
setTimeout(() => {
  void Sentry.flush();
}, 500);
