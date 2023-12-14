describe('API', () => {
  it('should capture Sentry.captureMessage', () =>
    runInSandbox(sandbox, () => {
      Sentry.captureMessage('Hello');
    }).then(summary => {
      assert.equal(summary.events[0].message, 'Hello');
    }));

  it('should capture Sentry.captureException', () =>
    runInSandbox(sandbox, () => {
      try {
        foo();
      } catch (e) {
        Sentry.captureException(e);
      }
    }).then(summary => {
      assert.isAtLeast(summary.events[0].exception.values[0].stacktrace.frames.length, 2);
      assert.isAtMost(summary.events[0].exception.values[0].stacktrace.frames.length, 4);
    }));

  it('should capture Sentry internal event as breadcrumbs for the following event sent', () =>
    runInSandbox(sandbox, { manual: true }, () => {
      window.allowSentryBreadcrumbs = true;
      Sentry.captureMessage('a');
      Sentry.captureMessage('b');
      // For the loader
      Sentry.flush && Sentry.flush(2000);
      window.finalizeManualTest();
    }).then(summary => {
      assert.equal(summary.events.length, 2);
      assert.equal(summary.breadcrumbs.length, 2);
      assert.equal(summary.events[1].breadcrumbs[0].category, 'sentry.event');
      assert.equal(summary.events[1].breadcrumbs[0].event_id, summary.events[0].event_id);
      assert.equal(summary.events[1].breadcrumbs[0].level, summary.events[0].level);
    }));

  it('should capture Sentry internal transaction as breadcrumbs for the following event sent', () =>
    runInSandbox(sandbox, { manual: true }, () => {
      window.allowSentryBreadcrumbs = true;
      Sentry.captureEvent({
        event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2',
        message: 'someMessage',
        transaction: 'wat',
        type: 'transaction',
      });
      Sentry.captureMessage('c');
      // For the loader
      Sentry.flush && Sentry.flush(2000);
      window.finalizeManualTest();
    }).then(summary => {
      // We have a length of one here since transactions don't go through beforeSend
      // and we add events to summary in beforeSend
      assert.equal(summary.events.length, 1);
      assert.equal(summary.breadcrumbs.length, 2);
      assert.equal(summary.events[0].breadcrumbs[0].category, 'sentry.transaction');
      assert.isNotEmpty(summary.events[0].breadcrumbs[0].event_id);
      assert.isUndefined(summary.events[0].breadcrumbs[0].level);
    }));

  it('should generate a synthetic trace for captureException w/ non-errors', () =>
    runInSandbox(sandbox, () => {
      throwNonError();
    }).then(summary => {
      assert.isAtLeast(summary.events[0].exception.values[0].stacktrace.frames.length, 1);
      assert.isAtMost(summary.events[0].exception.values[0].stacktrace.frames.length, 3);
    }));

  it('should have correct stacktrace order', () =>
    runInSandbox(sandbox, () => {
      try {
        foo();
      } catch (e) {
        Sentry.captureException(e);
      }
    }).then(summary => {
      assert.equal(
        summary.events[0].exception.values[0].stacktrace.frames[
          summary.events[0].exception.values[0].stacktrace.frames.length - 1
        ].function,
        'bar',
      );
      assert.isAtLeast(summary.events[0].exception.values[0].stacktrace.frames.length, 2);
      assert.isAtMost(summary.events[0].exception.values[0].stacktrace.frames.length, 4);
    }));

  it('should have exception with type and value', () =>
    runInSandbox(sandbox, () => {
      Sentry.captureException('this is my test exception');
    }).then(summary => {
      assert.isNotEmpty(summary.events[0].exception.values[0].value);
      assert.isNotEmpty(summary.events[0].exception.values[0].type);
    }));

  it('should reject duplicate, back-to-back errors from captureException', () =>
    runInSandbox(sandbox, () => {
      // Different exceptions, don't dedupe
      for (var i = 0; i < 2; i++) {
        throwRandomError();
      }

      // Same exceptions and same stacktrace, dedupe
      for (var j = 0; j < 2; j++) {
        throwError();
      }

      // Same exceptions, different stacktrace (different line number), don't dedupe
      throwSameConsecutiveErrors('bar');

      // Same exception, with transaction in between, dedupe
      throwError();
      Sentry.captureEvent({
        event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2',
        message: 'someMessage',
        transaction: 'wat',
        type: 'transaction',
      });
      throwError();
    }).then(summary => {
      // We have a length of one here since transactions don't go through beforeSend
      // and we add events to summary in beforeSend
      assert.equal(summary.events.length, 6);
      assert.match(summary.events[0].exception.values[0].value, /Exception no \d+/);
      assert.match(summary.events[1].exception.values[0].value, /Exception no \d+/);
      assert.equal(summary.events[2].exception.values[0].value, 'foo');
      assert.equal(summary.events[3].exception.values[0].value, 'bar');
      assert.equal(summary.events[4].exception.values[0].value, 'bar');
      assert.equal(summary.events[5].exception.values[0].value, 'foo');
    }));

  it('should not reject back-to-back errors with different stack traces', () =>
    runInSandbox(sandbox, () => {
      // same error message, but different stacks means that these are considered
      // different errors

      // stack:
      //   bar
      try {
        bar(); // declared in frame.html
      } catch (e) {
        Sentry.captureException(e);
      }

      // stack (different # frames):
      //   bar
      //   foo
      try {
        foo(); // declared in frame.html
      } catch (e) {
        Sentry.captureException(e);
      }

      // stack (same # frames, different frames):
      //   bar
      //   foo2
      try {
        foo2(); // declared in frame.html
      } catch (e) {
        Sentry.captureException(e);
      }
    }).then(summary => {
      // NOTE: regex because exact error message differs per-browser
      assert.match(summary.events[0].exception.values[0].value, /baz/);
      assert.equal(summary.events[0].exception.values[0].type, 'ReferenceError');
      assert.match(summary.events[1].exception.values[0].value, /baz/);
      assert.equal(summary.events[1].exception.values[0].type, 'ReferenceError');
      assert.match(summary.events[2].exception.values[0].value, /baz/);
      assert.equal(summary.events[2].exception.values[0].type, 'ReferenceError');
    }));

  it('should reject duplicate, back-to-back messages from captureMessage', () =>
    runInSandbox(sandbox, () => {
      // Different messages, don't dedupe
      for (var i = 0; i < 2; i++) {
        captureRandomMessage();
      }

      // Same messages and same stacktrace, dedupe
      for (var j = 0; j < 2; j++) {
        captureMessage('same message, same stacktrace');
      }

      // Same messages, different stacktrace (different line number), don't dedupe
      captureSameConsecutiveMessages('same message, different stacktrace');
    }).then(summary => {
      // On the async loader since we replay all messages from the same location,
      // so we actually only receive 4 summary.events
      assert.match(summary.events[0].message, /Message no \d+/);
      assert.match(summary.events[1].message, /Message no \d+/);
      assert.equal(summary.events[2].message, 'same message, same stacktrace');
      assert.equal(summary.events[3].message, 'same message, different stacktrace');
      !IS_LOADER && assert.equal(summary.events[4].message, 'same message, different stacktrace');
    }));
});
