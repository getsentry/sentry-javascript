'use strict';

// make console log not print so when we hammer the console endpoint we don't flood the terminal
console.log = function () {};

var Raven = require('../../');

var sentryDsn = 'https://public:private@app.getsentry.com/269';
Raven.config(sentryDsn, {
  autoBreadcrumbs: true
}).install();

var util = require('util');
var http = require('http');
var nock = require('nock');

// have to call this for each request :/ ref https://github.com/node-nock/nock#read-this---about-interceptors
function nockRequest() {
  nock('https://app.getsentry.com')
    .filteringRequestBody(/.*/, '*')
    .post('/api/269/store/', '*')
    .reply(200, 'OK');
}

var memwatch = require('memwatch-next');
memwatch.on('stats', function (stats) {
  process._rawDebug(util.format('gc #%d: min %d, max %d, est base %d, curr base %d',
    stats.num_full_gc, stats.min, stats.max, stats.estimated_base, stats.current_base
  ));
});

var express = require('express');
var app = express();

var hitBefore = {};

app.use(Raven.requestHandler());

app.use(function (req, res, next) {
  if (!hitBefore[req.url]) {
    hitBefore[req.url] = true;
    process._rawDebug('hit ' + req.url + ' for first time');
  }
  next();
});

app.get('/context/basic', function (req, res, next) {
  Raven.setContext({
    extra: {
      example: 'hey look we set some example context data yay',
    }
  });
  res.textToSend = 'hello there! we set some stuff to the context';
  next();
});

app.get('/breadcrumbs/capture', function (req, res, next) {
  Raven.captureBreadcrumb({
    message: 'Captured example breadcrumb',
    category: 'log',
    data: {
      example: 'hey look we captured this example breadcrumb yay'
    }
  });
  res.textToSend = 'hello there! we captured an example breadcrumb';
  next();
});

app.get('/breadcrumbs/auto/console', function (req, res, next) {
  console.log('hello there! i am printing to the console!');
  res.textToSend = 'hello there! we printed to the console';
  next();
});

app.get('/breadcrumbs/auto/http', function (req, res, next) {
  var scope = nock('http://www.example.com')
    .get('/hello')
    .reply(200, 'hello world');

  http.get('http://www.example.com/hello', function (nockRes) {
    scope.done();
    res.textToSend = 'hello there! we got hello world from example.com';
    next();
  }).on('error', next);
});

app.get('/hello', function (req, res, next) {
  res.textToSend = 'hello!';
  next();
});

app.get('/gc', function (req, res, next) {
  memwatch.gc();
  res.textToSend = 'collected garbage';
  next();
});

app.get('/shutdown', function (req, res, next) {
  setTimeout(function () {
    server.close(function () { // eslint-disable-line no-use-before-define
      process.exit();
    });
  }, 100);
  return res.send('shutting down');
});

app.get('/capture', function (req, res, next) {
  for (var i = 0; i < 1000; ++i) {
    nockRequest();
    Raven.captureException(new Error('oh no an exception to capture'));
  }
  memwatch.gc();
  res.textToSend = 'capturing an exception!';
  next();
});

app.get('/capture_large_source', function (req, res, next) {
  nockRequest();

  // largeModule.run recurses 1000 times, largeModule is a 5MB file
  // if we read the largeModule source once for each frame, we'll use a ton of memory
  var largeModule = require('./largeModule');

  try {
    largeModule.run();
  } catch (e) {
    Raven.captureException(e);
  }

  memwatch.gc();
  res.textToSend = 'capturing an exception!';
  next();
});

app.use(function (req, res, next) {
  if (req.query.doError) {
    nockRequest();
    return next(new Error(res.textToSend));
  }
  return res.send(res.textToSend);
});

app.use(Raven.errorHandler());

app.use(function (err, req, res, next) {
  return res.status(500).send('oh no there was an error: ' + err.message);
});

var server = app.listen(3000, function () {
  process._rawDebug('patient is waiting to be poked on port 3000');
  memwatch.gc();
});
