const http = require('http');
const express = require('express');
const app = express();
const Sentry = require('../../../dist');

function assertTags(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error('FAILED: Scope contains incorrect tags');
    process.exit(1);
  }
}

let remaining = 3;

class DummyTransport {
  sendEvent(event) {
    --remaining;

    if (!remaining) {
      console.error('SUCCESS: All scopes contain correct tags');
      process.exit(0);
    }

    return Promise.resolve({
      status: 'success',
    });
  }
}

Sentry.init({
  dsn: 'http://test@example.com/1337',
  transport: DummyTransport,
  beforeSend(event) {
    if (event.message === 'Error: foo') {
      assertTags(event.tags, {
        global: 'wat',
        foo: 'wat',
      });
    } else if (event.message === 'Error: bar') {
      assertTags(event.tags, {
        global: 'wat',
        bar: 'wat',
      });
    } else if (event.message === 'Error: baz') {
      assertTags(event.tags, {
        global: 'wat',
        baz: 'wat',
      });
    }
    return event;
  },
});

Sentry.configureScope(scope => {
  scope.setTag('global', 'wat');
});

app.use(Sentry.Handlers.requestHandler());

app.get('/foo', req => {
  Sentry.configureScope(scope => {
    scope.setTag('foo', 'wat');
  });

  throw new Error('foo');
});

app.get('/bar', req => {
  Sentry.configureScope(scope => {
    scope.setTag('bar', 'wat');
  });

  throw new Error('bar');
});

app.get('/baz', req => {
  Sentry.configureScope(scope => {
    scope.setTag('baz', 'wat');
  });

  throw new Error('baz');
});

app.use(Sentry.Handlers.errorHandler());

app.listen(1121);

http.get('http://localhost:1121/foo');
http.get('http://localhost:1121/bar');
http.get('http://localhost:1121/baz');
