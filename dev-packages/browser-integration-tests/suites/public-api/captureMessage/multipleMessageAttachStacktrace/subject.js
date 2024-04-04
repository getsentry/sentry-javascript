function captureMessage(message) {
  // eslint-disable-next-line no-param-reassign
  message = message || 'message';
  Sentry.captureMessage(message);
}

function captureRandomMessage() {
  Sentry.captureMessage('Message no ' + (Date.now() + Math.random()));
}

function captureSameConsecutiveMessages(message) {
  captureMessage(message);
  captureMessage(message);
}

// Different messages, don't dedupe
for (var i = 0; i < 2; i++) {
  captureRandomMessage();
}

// Same messages and same stacktrace, dedupe
for (var j = 0; j < 3; j++) {
  captureMessage('same message, same stacktrace');
}

// Same messages, different stacktrace (different line number), don't dedupe
captureSameConsecutiveMessages('same message, different stacktrace');
