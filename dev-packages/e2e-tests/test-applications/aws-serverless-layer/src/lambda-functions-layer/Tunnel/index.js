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
  };
  const envelope = `${JSON.stringify(envelopeHeader)}\n${JSON.stringify(envelopeItemHeader)}\n${JSON.stringify(
    envelopeItemPayload,
  )}\n`;

  const response = await fetch('http://localhost:9000/envelope', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
    },
    body: envelope,
  });

  const responseBody = await response.text();

  return {
    attemptedDsn: dsn,
    status: response.status,
    responseBody,
  };
};
