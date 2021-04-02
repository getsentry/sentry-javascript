const http = require('http');
const express = require('express');
const app = express();
const Sentry = require('../../../dist');

Sentry.init({
  debug: true,
  dsn: 'http://test@example.com/1337',
  beforeSend(event) {
    console.log(JSON.stringify(event, null, 2));
    return null;
  },
});

function hasSentryTraceHeader(req) {
  return req.headers && typeof req.headers['sentry-trace'] === 'string';
}

class Tracing {
  static start() {
    return (req, _res, next) => {
      const transaction = `${req.method.toUpperCase()} ${req.originalUrl}`;
      const span = hasSentryTraceHeader(req)
        ? Span.fromTraceparent(req.headers['sentry-trace'], {
            transaction,
          })
        : Sentry.startTransaction({
            name: transaction,
          });

      Sentry.getCurrentHub().configureScope(scope => {
        scope.setSpan(span);
      });

      next();
    };
  }

  static finish() {
    return (_req, _res, next) => {
      const scope = Sentry.getCurrentHub().getScope();
      if (!scope) {
        return next();
      }
      const span = scope.getSpan();
      if (!span) {
        return next();
      }
      Sentry.getCurrentHub().finishSpan(span);
      next();
    };
  }
}

async function databaseCall(_query) {
  const span = Sentry.getCurrentHub().startSpan({
    op: 'db',
  });

  return new Promise(resolve => {
    setTimeout(() => {
      Sentry.getCurrentHub().finishSpan(span);
      resolve('http://whatever.com/raw');
    }, Math.random() * 100);
  });
}

async function httpCall(_url) {
  const span = Sentry.getCurrentHub().startSpan({
    op: 'http',
  });

  return new Promise(resolve => {
    setTimeout(() => {
      Sentry.getCurrentHub().finishSpan(span);
      resolve('httpCall');
    }, Math.random() * 100);
  });
}

async function encodeData(_data) {
  const span = Sentry.getCurrentHub().startSpan({
    op: 'encode',
  });

  return new Promise(resolve => {
    setTimeout(() => {
      Sentry.getCurrentHub().finishSpan(span);
      resolve('encodedData');
    }, Math.random() * 100);
  });
}

app.use(Sentry.Handlers.requestHandler());
app.use(Tracing.start());

app.get('/trace', async (_req, res, next) => {
  const url = await databaseCall('SELECT url FROM queue WHERE processed = 0 LIMIT 1');
  const raw = await httpCall(url);
  const encoded = await encodeData(raw);
  res.status(200).send(encoded);
  next();
});

app.use(Tracing.finish());
app.use(Sentry.Handlers.errorHandler());

const server = app.listen(1231, () => {
  http.get('http://localhost:1231/trace', res => {
    server.close();
  });
});
