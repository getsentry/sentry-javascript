# Raven [![Build Status](https://secure.travis-ci.org/getsentry/raven-node.png?branch=master)](http://travis-ci.org/getsentry/raven-node)
**Node v0.11 compatible**

Log errors and stack traces in [Sentry](http://getsentry.com/) from within your Node.js applications. Includes middleware support for [Connect](http://www.senchalabs.org/connect/)/[Express](http://expressjs.com/).

All processing and sending happens asynchronously to not slow things down if/when Sentry is down or slow.

## Compatibility
 * 0.6.x
 * 0.8.x
 * 0.10.x
 * 0.11.x

Raven 0.7+ requires Sentry 6.4+

## Installation
```
$ npm install raven
```

## Methods
```javascript
new raven.Client(String dsn[, Object options])
client.captureMessage(String message[[, Object options], Function callback])
client.captureError(Error error[[, Object options], Function callback])
client.captureQuery(String query[[, String type], Function callback])
```

## Basic Usage
```javascript
var raven = require('raven');
var client = new raven.Client('{{ SENTRY_DSN }}');

client.captureMessage('Hello, world!');
```
You can specify a level in the second optional parameter. Default level is `error`


**Sentry is aware of five different levels:**
 * debug (the least serious)
 * info
 * warning
 * error
 * fatal (the most serious)

```javascript
var raven = require('raven');

var client = new raven.Client('{{ SENTRY_DSN }}', {level: 'warning'});

client.captureMessage("Another message")
```

**Adding extra info an event**
```javascript
var raven = require('raven');

var client = new raven.Client('{{ SENTRY_DSN }}');

client.captureMessage("Another message", {extra: {'key': 'value'}})
```

**Adding tags to an event**
```javascript
var raven = require('raven');

var client = new raven.Client('{{ SENTRY_DSN }}');

client.captureMessage("Another message", {tags: {'key': 'value'}})
```

## Logging an error
```javascript
client.captureError(new Error('Broke!'));
```

## Logging a query
```javascript
client.captureQuery('SELECT * FROM `awesome`', 'mysql');
```

## Sentry Identifier
```javascript
client.captureMessage('Hello, world!', function(result) {
    console.log(client.getIdent(result));
});
```

```javascript
client.captureError(new Error('Broke!'), function(result) {
  console.log(client.getIdent(result));
});
```

__Note__: `client.captureMessage` will also return the result directly without the need for a callback, such as: `var result = client.captureMessage('Hello, world!');`

## Events
If you really care if the event was logged or errored out, Client emits two events, `logged` and `error`:

```javascript
client.on('logged', function(){
  console.log('Yay, it worked!');
});
client.on('error', function(e){
  console.log('oh well, Sentry is broke.');
})
client.captureMessage('Boom');
```

### Error Event
The event error is augmented with the original Sentry response object as well as the response body and statusCode for easier debugging.

```javascript
client.on('error', function(e){
  console.log(e.reason);  // raw response body, usually contains a message explaining the failure
  console.log(e.statusCode);  // status code of the http request
  console.log(e.response);  // entire raw http response object
});
```

## Environment variables
### SENTRY_DSN
Optionally declare the DSN to use for the client through the environment. Initializing the client in your app won't require setting the DSN.

### SENTRY_NAME
Optionally set the name for the client to use. [What is name?](http://raven.readthedocs.org/en/latest/config/index.html#name)

### SENTRY_SITE
Optionally set the site for the client to use. [What is site?](http://raven.readthedocs.org/en/latest/config/index.html#site)

## Catching global errors
For those times when you don't catch all errors in your application. ;)

```javascript
client.patchGlobal();
// or
raven.patchGlobal(client);
// or
raven.patchGlobal('{{ SENTRY_DSN }}');
```

It is recommended that you don't leave the process running after receiving an `uncaughtException` (http://nodejs.org/api/process.html#process_event_uncaughtexception), so an optional callback is provided to allow you to hook in something like:

```javascript
client.patchGlobal(function() {
  console.log('Bye, bye, world.');
  process.exit(1);
});
```

The callback is called **after** the event has been sent to the Sentry server.

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
var app = require('express')();
app.get('/', function mainHandler(req, res) {
  throw new Error('Broke!');
});
app.use(raven.middleware.express('{{ SENTRY_DSN }}'));
app.use(onError); // optional error handler if you want to display the error id to a user
app.listen(3000);
```

__Note__: `raven.middleware.express` or `raven.middleware.connect` *must* be added to the middleware stack *before* any other error handling middlewares or there's a chance that the error will never get to Sentry.

## Coffeescript
In order to use raven-node with coffee-script or another library which overwrites
Error.prepareStackTrace you might run into the exception "Traceback does not support Error.prepareStackTrace being defined already."

In order to not have raven-node (and the underlying raw-stacktrace library) require
Traceback you can pass your own stackFunction in the options. For example:

```coffeescript
client = new raven.Client('{{ SENTRY_DSN }}', { stackFunction: {{ Your stack function }}});
```

So for example:
```coffeescript
client = new raven.Client('{{ SENTRY_DSN }}', {
  stackFunction: Error.prepareStackTrace
});
```

## Pre-processing data
Pass the `dataCallback` configuration value:

```javascript
client = new raven.Client('{{ SENTRY_DSN }}', {
  dataCallback: function(data) {
    delete data.request.env;
    return data;
  }
});
```

## Disable Raven
Pass `false` as the DSN (or any falsey value).

```javascript
client = new raven.Client(process.env.NODE_ENV === 'production' && '{{ SENTRY_DSN }}')
```

__Note__: We don't infer this from `NODE_ENV` automatically anymore. It's up to you to implement whatever logic you'd like.

## Support
You can find me on IRC. I troll in `#sentry` on `freenode`.
