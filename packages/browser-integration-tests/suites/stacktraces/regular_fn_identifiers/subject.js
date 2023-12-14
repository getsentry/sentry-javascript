function foo() {
  bar();
}

const bar = () => {
  Test.baz();
};

class Test {
  constructor() {}

  static baz(params) {
    throw new Error('test_err');
  }
}

const qux = () => {
  (() => {
    (() => {
      foo();
    })();
  })();
};

try {
  qux();
} catch (err) {
  Sentry.captureException(err);
}
