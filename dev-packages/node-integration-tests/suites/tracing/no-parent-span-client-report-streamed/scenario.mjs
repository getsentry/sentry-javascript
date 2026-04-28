import * as Sentry from '@sentry/node';
import http from 'http';
http.get('http://localhost:9999/external', () => {}).on('error', () => {});

// Flush the span buffer before the process exits.
// The span buffer uses an unref'd timeout, so without an explicit flush
// the process would exit before the buffer drains.
// Using beforeExit ensures the request has completed and the span has ended.
process.on('beforeExit', () => {
  void Sentry.flush();
});
