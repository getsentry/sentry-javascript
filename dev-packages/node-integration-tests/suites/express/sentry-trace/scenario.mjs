import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import cors from 'cors';
import express from 'express';
import http from 'http';

const app = express();

// Set globally so we can assert user data is not leaked into propagated baggage.
Sentry.setUser({ id: 'user123' });

app.use(cors());

// Plain outgoing request — used to assert propagated `sentry-trace`/`baggage` headers.
app.get('/test/express', (_req, res) => {
  const headers = http.get('http://somewhere.not.sentry/').getHeaders();
  res.send({ test_data: headers });
});

// Replaces the dynamic trace id in the outgoing baggage with a stable placeholder
// so the propagated baggage can be asserted deterministically.
app.get('/test/express-replace-trace-id', (_req, res) => {
  const span = Sentry.getActiveSpan();
  const traceId = span?.spanContext().traceId;
  const headers = http.get('http://somewhere.not.sentry/').getHeaders();
  if (traceId) {
    headers['baggage'] = headers['baggage'].replace(traceId, '__SENTRY_TRACE_ID__');
  }
  res.send({ test_data: headers });
});

// Sets a third-party baggage header on the outgoing request, which the SDK should
// merge with the Sentry DSC entries.
app.get('/test/express-third-party-baggage', (_req, res) => {
  const headers = http
    .get({ hostname: 'somewhere.not.sentry', headers: { baggage: 'other=vendor,foo=bar,third=party' } })
    .getHeaders();
  res.send({ test_data: headers });
});

// Sets a third-party baggage header that also contains sentry-* entries, which the
// SDK should ignore/overwrite with the actual DSC.
app.get('/test/express-third-party-baggage-with-sentry', (_req, res) => {
  const headers = http
    .get({
      hostname: 'somewhere.not.sentry',
      headers: {
        baggage:
          'other=vendor,foo=bar,third=party,sentry-release=9.9.9,sentry-environment=staging,sentry-sample_rate=0.54,last=item',
      },
    })
    .getHeaders();
  res.send({ test_data: headers });
});

// Forwards the incoming baggage header to the outgoing request, to assert that
// property values with `=` signs are preserved during parsing & re-serialization.
app.get('/test/express-property-values', (req, res) => {
  const incomingBaggage = req.headers.baggage;
  const headers = http.get({ hostname: 'somewhere.not.sentry', headers: { baggage: incomingBaggage } }).getHeaders();
  res.send({ test_data: headers });
});

startExpressServerAndSendPortToRunner(app);
