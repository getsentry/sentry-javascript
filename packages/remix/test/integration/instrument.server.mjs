import * as Sentry from '@sentry/remix';
import { createTransport } from '@sentry/core';

// Global storage for captured envelopes - test helpers will read from this
globalThis.__SENTRY_TEST_ENVELOPES__ = globalThis.__SENTRY_TEST_ENVELOPES__ || [];

// Create a custom transport that captures envelopes instead of sending them
function makeTestTransport(options) {
  function makeRequest(request) {
    // Parse the serialized envelope body the same way the test helper's parseEnvelope does
    // The body is a serialized string with newline-separated JSON lines
    const bodyStr = typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body);
    // Split by newlines and parse each line as JSON - this matches test helper format
    const envelope = bodyStr
      .split('\n')
      .filter(line => line.trim())
      .map(e => JSON.parse(e));
    globalThis.__SENTRY_TEST_ENVELOPES__.push(envelope);

    // Return a successful response
    return Promise.resolve({
      statusCode: 200,
      headers: {},
    });
  }

  return createTransport(options, makeRequest);
}

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1,
  tracePropagationTargets: ['example.org'],
  transport: makeTestTransport,
});
