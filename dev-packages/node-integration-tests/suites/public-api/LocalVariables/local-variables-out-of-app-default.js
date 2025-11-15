/* eslint-disable no-unused-vars */

const Sentry = require('@sentry/node');
const { loggingTransport } = require('@sentry-internal/node-integration-tests');

// make sure to create the following file with the following content:
// function out_of_app_function() {
//   const outOfAppVar = 'out of app value';
//   throw new Error('out-of-app error');
// }

// module.exports = { out_of_app_function };

const { out_of_app_function } = require('./node_modules/test-module/out-of-app-function.js');

function in_app_function() {
  const inAppVar = 'in app value';
  out_of_app_function();
}

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: loggingTransport,
  includeLocalVariables: true,
  // either set each frame's in_app flag manually or import the `out_of_app_function` from a node_module directory
  // beforeSend: (event) => {
  //   event.exception?.values?.[0]?.stacktrace?.frames?.forEach(frame => {
  //     if (frame.function === 'out_of_app_function') {
  //       frame.in_app = false;
  //     }
  //   });
  //   return event;
  // },
});

setTimeout(async () => {
  try {
    in_app_function();
  } catch (e) {
    Sentry.captureException(e);
    await Sentry.flush();

    return null;
  }
}, 1000);
