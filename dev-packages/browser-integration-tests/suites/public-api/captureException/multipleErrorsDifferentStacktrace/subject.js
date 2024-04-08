function bar() {
  baz();
}

function foo() {
  bar();
}

function foo2() {
  // identical to foo, but meant for testing
  // different stack frame fns w/ same stack length
  bar();
}
// same error message, but different stacks means that these are considered
// different errors

// stack:
//   bar
try {
  bar();
} catch (e) {
  Sentry.captureException(e);
}

// stack (different # frames):
//   bar
//   foo
try {
  foo();
} catch (e) {
  Sentry.captureException(e);
}

// stack (same # frames, different frames):
//   bar
//   foo2
try {
  foo2();
} catch (e) {
  Sentry.captureException(e);
}
