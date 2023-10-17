const { TextEncoder, TextDecoder } = require('util');

const { createTransport } = require('@sentry/core');
const { parseEnvelope } = require('@sentry/utils');

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// A transport that just logs the envelope payloads to console for checking in tests
exports.transport = () => {
  return createTransport({ recordDroppedEvent: () => {}, textEncoder }, async request => {
    const env = parseEnvelope(request.body, textEncoder, textDecoder);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(env[1][0][1]));
    return { statusCode: 200 };
  });
};
