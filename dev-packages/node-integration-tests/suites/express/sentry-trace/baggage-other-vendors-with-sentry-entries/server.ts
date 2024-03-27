import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

export type TestAPIResponse = { test_data: { host: string; 'sentry-trace': string; baggage: string } };

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  environment: 'prod',
  // disable requests to /express
  tracePropagationTargets: [/^(?!.*express).*$/],
  integrations: [
    // TODO: This used to use the Express integration
  ],
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

import * as http from 'http';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import cors from 'cors';
import express from 'express';

const app = express();

app.use(cors());

app.get('/test/express', (_req, res) => {
  // simulate setting a "third party" baggage header which the Sentry SDK should merge with Sentry DSC entries
  const headers = http
    .get({
      hostname: 'somewhere.not.sentry',
      headers: {
        baggage:
          'other=vendor,foo=bar,third=party,sentry-release=9.9.9,sentry-environment=staging,sentry-sample_rate=0.54,last=item',
      },
    })
    .getHeaders();

  // Responding with the headers outgoing request headers back to the assertions.
  res.send({ test_data: headers });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
