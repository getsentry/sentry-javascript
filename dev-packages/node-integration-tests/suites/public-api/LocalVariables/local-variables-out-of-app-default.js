const Sentry = require('@sentry/node');
const { loggingTransport } = require('@sentry-internal/node-integration-tests');

const externalFunctionFile = require.resolve('./node_modules/out-of-app-function.js');

const { out_of_app_function } = require(externalFunctionFile);

function in_app_function() {
  const inAppVar = 'in app value';
  out_of_app_function(`${inAppVar} modified value`);
}

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: loggingTransport,
  includeLocalVariables: true,
});

setTimeout(async () => {
  try {
    in_app_function();
  } catch (e) {
    Sentry.captureException(e);
    await Sentry.flush();
  }
}, 500);
