const Sentry = require('@sentry/node');
const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const { waitForLocalVariablesCapture } = require('./wait-for-local-variables');

const externalFunctionFile = require.resolve('./node_modules/out-of-app-function.js');

const { out_of_app_function } = require(externalFunctionFile);

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: loggingTransport,
  includeLocalVariables: true,
  integrations: [
    Sentry.localVariablesIntegration({
      includeOutOfAppFrames: true,
    }),
  ],
});

function in_app_function() {
  const inAppVar = 'in app value';
  out_of_app_function(`${inAppVar} modified value`);
}

(async () => {
  await waitForLocalVariablesCapture();

  try {
    in_app_function();
  } catch (e) {
    Sentry.captureException(e);
    await Sentry.flush();
  }
})().catch(error => {
  process.stderr.write(`${error}\n`);
  process.exit(1);
});
