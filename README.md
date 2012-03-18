# Raven [![Build Status](https://secure.travis-ci.org/mattrobenolt/raven-node.png?branch=master)](http://travis-ci.org/mattrobenolt/raven-node)
Log errors and stack traces in [Sentry](http://getsentry.com/) from within your Node.js applications. Includes middleware support for [Connect](http://www.senchalabs.org/connect/)/[Express](http://expressjs.com/).

All processing and sending happens asynchronously to not slow things down if/when Sentry is down or slow.

## Installation
```
$ npm install raven
```

## Basic Usage
```javascript
var raven = require('raven');
var client = new raven.Client('{{ SENTRY_DSN }}');

client.createFromText('Hello, world!');
```

## Logging an error
```javascript
client.createFromError(new Error('Broke!'));
```

## Sentry Identifier
```javascript
client.createFromText('Hello, world!', function(result) {
    console.log(client.getIdent(result));
});
```

```javascript
client.createFromError(new Error('Broke!'), function(result) {
  console.log(client.getIdent(result));
});
```

__Note__: `client.createFromText` will also return the result directly without the need for a callback, such as: `var result = client.createFromText('Hello, world!');`

## Catching global errors
For those times when you don't catch all errors in your application. ;)

```javascript
client.patchGlobal();
// or
raven.patchGlobal(client);
// or
raven.patchGlobal('{{ SENTRY_DSN }}');
```

## Methods
```javascript
new raven.Client(dsn[, options])
client.createFromText(string[,callback])
client.createFromError(Error[,callback])
```

## Integrations
### Connect/Express middleware
The Raven middleware can be used as-is with either Connect or Express in the same way. Take note that in your middlewares, Raven must appear _after_ your main handler to pick up any errors that may result from handling a request.

#### Connect
```javascript
var connect = require('connect');
function mainHandler(req, res) {
  throw new Error('Broke!');
}
function onError(err, req, res, next) {
  // The error id is attached to `res.sentry` to be returned
  // and optionally displayed to the user for support.
  res.statusCode = 500;
  res.end(res.sentry+'\n');
}
connect(
  connect.bodyParser(),
  connect.cookieParser(),
  mainHandler,
  raven.middleware.connect('{{ SENTRY_DSN }}'),
  onError, // optional error handler if you want to display the error id to a user
).listen(3000);
```

#### Express
```javascript
var app = require('express').createServer();
app.error(raven.middleware.express('{{ SENTRY_DSN }}'));
app.error(onError); // optional error handler if you want to display the error id to a user
app.get('/', function mainHandler(req, res) {
  throw new Error('Broke!');
});
app.listen(3000);
```

## Todo
 * Support for process.env.SENTRY_DSN
 * More complete test coverage
 * More comments in code
 * More third party integration
