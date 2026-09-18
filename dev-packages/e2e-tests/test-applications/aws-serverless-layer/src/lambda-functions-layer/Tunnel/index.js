const zlib = require('node:zlib');

function makeHex(length) {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

exports.handler = async event => {
  const dsn = event?.dsn ?? process.env.SENTRY_DSN ?? process.env.TUNNEL_TEST_DSN;

  const envelopeHeader = event?.omitDsn
    ? {}
    : {
        dsn,
      };
  const envelopeItemHeader = { type: 'event' };
  const envelopeItemPayload = {
    event_id: makeHex(32),
    message: event?.marker ?? 'lambda-extension-tunnel-test',
    level: 'info',
    // `makeNodeTransport` only gzips past 32KiB, so a compressed envelope smaller than that never
    // exercises what the tunnel does with the ones the SDK actually compresses.
    ...(event?.padTo ? { padding: 'x'.repeat(Number(event.padTo)) } : {}),
  };
  const envelope = `${JSON.stringify(envelopeHeader)}\n${JSON.stringify(envelopeItemHeader)}\n${JSON.stringify(
    envelopeItemPayload,
  )}\n`;

  // `makeNodeTransport` gzips any body over 32KiB, so the tunnel has to read a compressed
  // envelope header. It could not, and answered 500 — silently dropping every large event.
  const compressed = event?.gzip ? zlib.gzipSync(Buffer.from(envelope)) : undefined;

  const response = await fetch('http://localhost:9000/envelope', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      ...(compressed ? { 'content-encoding': event.gzip } : {}),
    },
    body: compressed ?? envelope,
  });

  const responseBody = await response.text();

  return {
    attemptedDsn: dsn,
    status: response.status,
    responseBody,
  };
};
