const Sentry = require('../../../dist');

Sentry.init({ dsn: 'https://public@app.getsentry.com/12345' });

const util = require('util');
const http = require('http');
const nock = require('nock');

// have to call this for each request :/ ref https://github.com/node-nock/nock#read-this---about-interceptors
function nockRequest() {
  nock('https://app.getsentry.com')
    .filteringRequestBody(/.*/, '*')
    .post(/.*/, '*')
    .reply(200, 'OK');
}

const memwatch = require('memwatch-next');
memwatch.on('stats', function(stats) {
  process._rawDebug(
    util.format(
      'gc #%d: min %d, max %d, est base %d, curr base %d',
      stats.num_full_gc,
      stats.min,
      stats.max,
      stats.estimated_base,
      stats.current_base,
    ),
  );
});

const express = require('express');
const app = express();

const hitBefore = {};

app.use(Sentry.Handlers.requestHandler());

app.use((req, res, next) => {
  if (!hitBefore[req.url]) {
    hitBefore[req.url] = true;
    process._rawDebug('hit ' + req.url + ' for first time');
  }
  next();
});

app.get('/context/basic', (req, res, next) => {
  Sentry.configureScope(scope => {
    scope.setExtra('example', 'hey look we set some example context data yay');
  });

  res.textToSend = 'hello there! we set some stuff to the context';
  next();
});

app.get('/breadcrumbs/capture', (req, res, next) => {
  Sentry.captureBreadcrumb({
    message: 'Captured example breadcrumb',
    category: 'log',
    data: {
      example: 'hey look we captured this example breadcrumb yay',
    },
  });
  res.textToSend = 'hello there! we captured an example breadcrumb';
  next();
});

app.get('/breadcrumbs/auto/console', (req, res, next) => {
  console.log('hello there! i am printing to the console!');
  res.textToSend = 'hello there! we printed to the console';
  next();
});

app.get('/breadcrumbs/auto/http', (req, res, next) => {
  const scope = nock('http://www.example.com')
    .get('/hello')
    .reply(200, 'hello world');

  http
    .get('http://www.example.com/hello', function(nockRes) {
      scope.done();
      res.textToSend = 'hello there! we got hello world from example.com';
      next();
    })
    .on('error', next);
});

app.get('/hello', (req, res, next) => {
  res.textToSend = 'hello!';
  next();
});

app.get('/gc', (req, res, next) => {
  memwatch.gc();
  res.textToSend = 'collected garbage';
  next();
});

app.get('/shutdown', (req, res, next) => {
  setTimeout(function() {
    server.close(function() {
      process.exit();
    });
  }, 100);
  return res.send('shutting down');
});

app.get('/capture', (req, res, next) => {
  for (let i = 0; i < 1000; ++i) {
    nockRequest();
    Sentry.captureException(new Error('oh no an exception to capture'));
  }
  memwatch.gc();
  res.textToSend = 'capturing an exception!';
  next();
});

app.get('/capture_large_source', (req, res, next) => {
  nockRequest();

  // largeModule.run recurses 1000 times, largeModule is a 5MB file
  // if we read the largeModule source once for each frame, we'll use a ton of memory
  const largeModule = require('./large-module-dist');

  try {
    largeModule.run();
  } catch (e) {
    Sentry.captureException(e);
  }

  memwatch.gc();
  res.textToSend = 'capturing an exception!';
  next();
});

app.use((req, res, next) => {
  if (req.query.doError) {
    nockRequest();
    return next(new Error(res.textToSend));
  }
  return res.send(res.textToSend);
});

app.use(Sentry.Handlers.errorHandler());

app.use((err, req, res, next) => {
  return res.status(500).send('oh no there was an error: ' + err.message);
});

const server = app.listen(5140, () => {
  process._rawDebug('patient is waiting to be poked on port 5140');
  memwatch.gc();
});
