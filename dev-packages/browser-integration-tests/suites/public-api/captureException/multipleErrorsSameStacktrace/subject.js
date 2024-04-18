function throwError(message) {
  // eslint-disable-next-line no-param-reassign
  message = message || 'foo';
  try {
    throw new Error(message);
  } catch (o_O) {
    Sentry.captureException(o_O);
  }
}

function throwRandomError() {
  try {
    throw new Error('Exception no ' + (Date.now() + Math.random()));
  } catch (o_O) {
    Sentry.captureException(o_O);
  }
}

function createError() {
  function nestedFunction() {
    return new Error('created');
  }

  return nestedFunction();
}

function throwSameConsecutiveErrors(message) {
  throwError(message);
  throwError(message);
}

// Different exceptions, don't dedupe
for (var i = 0; i < 2; i++) {
  throwRandomError();
}

// Same exceptions and same stacktrace, dedupe
for (var j = 0; j < 2; j++) {
  throwError();
}

const syntheticError = createError();

// Same exception, with transaction in between, dedupe
Sentry.captureException(syntheticError);
Sentry.captureEvent({
  event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2',
  message: 'someMessage',
  transaction: 'wat',
  type: 'transaction',
});
Sentry.captureException(syntheticError);

// Same exceptions, different stacktrace (different line number), don't dedupe
throwSameConsecutiveErrors('bar');
