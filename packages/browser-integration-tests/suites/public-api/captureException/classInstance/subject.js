class MyTestClass {
  prop1 = 'value1';
  prop2 = 2;
}

Sentry.captureException(new MyTestClass());
