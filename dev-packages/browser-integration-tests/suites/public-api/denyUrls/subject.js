/**
 * We always filter on the caller, not the cause of the error
 *
 * > foo.js file called a function in bar.js
 * > bar.js file called a function in baz.js
 * > baz.js threw an error
 *
 * foo.js is denied in the `init` call (init.js), thus we filter it
 * */
var urlWithDeniedUrl = new Error('filter');
urlWithDeniedUrl.stack =
  'Error: bar\n' +
  ' at http://localhost:5000/foo.js:7:19\n' +
  ' at bar(http://localhost:5000/bar.js:2:3)\n' +
  ' at baz(http://localhost:5000/baz.js:2:9)\n';

/**
 * > foo-pass.js file called a function in bar-pass.js
 * > bar-pass.js file called a function in baz-pass.js
 * > baz-pass.js threw an error
 *
 * foo-pass.js is *not* denied in the `init` call (init.js), thus we don't filter it
 * */
var urlWithoutDeniedUrl = new Error('pass');
urlWithoutDeniedUrl.stack =
  'Error: bar\n' +
  ' at http://localhost:5000/foo-pass.js:7:19\n' +
  ' at bar(http://localhost:5000/bar-pass.js:2:3)\n' +
  ' at baz(http://localhost:5000/baz-pass.js:2:9)\n';

Sentry.captureException(urlWithDeniedUrl);
Sentry.captureException(urlWithoutDeniedUrl);
