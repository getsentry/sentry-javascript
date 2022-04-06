const http = require('http');
const express = require('express');
const app = express();
const Sentry = require('../../../build/dist');

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
      server.close();
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
    if (event.transaction === 'GET /foo') {
      assertTags(event.tags, {
        global: 'wat',
        foo: 'wat',
      });
    } else if (event.transaction === 'GET /bar') {
      assertTags(event.tags, {
        global: 'wat',
        bar: 'wat',
      });
    } else if (event.transaction === 'GET /baz') {
      assertTags(event.tags, {
        global: 'wat',
        baz: 'wat',
      });
    } else {
      assertTags(event.tags, {
        global: 'wat',
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

const server = app.listen(0, () => {
  const port = server.address().port;
  http.get(`http://localhost:${port}/foo`);
  http.get(`http://localhost:${port}/bar`);
  http.get(`http://localhost:${port}/baz`);
});
