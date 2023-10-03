const http = require('http');
const express = require('express');
const app = express();
const Sentry = require('../../../../build/cjs');
const { colorize } = require('../../colorize');
const { TextEncoder } = require('util');

// don't log the test errors we're going to throw, so at a quick glance it doesn't look like the test itself has failed
global.console.error = () => null;

function assertTags(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.log(colorize('FAILED: Scope contains incorrect tags\n', 'red'));
    console.log(colorize(`Got: ${JSON.stringify(actual)}\n`, 'red'));
    console.log(colorize(`Expected: ${JSON.stringify(expected)}\n`, 'red'));
    process.exit(1);
  }
}

let remaining = 3;

function makeDummyTransport() {
  return Sentry.createTransport({ recordDroppedEvent: () => undefined, textEncoder: new TextEncoder() }, req => {
    --remaining;

    if (!remaining) {
      console.log(colorize('PASSED: All scopes contain correct tags\n', 'green'));
      server.close();
      process.exit(0);
    }

    return Promise.resolve({
      statusCode: 200,
    });
  });
}

Sentry.init({
  dsn: 'http://test@example.com/1337',
  transport: makeDummyTransport,
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
