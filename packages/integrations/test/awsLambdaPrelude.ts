/**
 * This function returns the client file.
 * @param additionalLambdaPrelude - Holds the scenario, timeoutWarning and error string.
 */

export function lambdaPreludeReplacer(additionalLambdaPrelude: {
  scenario: string;
  timeoutWarning: boolean;
  error: string;
}): string {
  const lambdaPrelude = `
const http = require('http');
const Sentry = require('@sentry/node');
const { AWSLambdaIntegration } = require('@sentry/integrations');
const { HTTPSTransport } = require('@sentry/node/dist/transports');

class testTransport extends HTTPSTransport {
  constructor() {
    super(...arguments);
  }
  async sendEvent(event) {
    console.log('Event:', JSON.stringify(event));
  }
}

// Configure the Sentry SDK.
Sentry.init({
  dsn: 'https://e16b3f19d01b4989b118f20dbcc11f87@o388065.ingest.sentry.io/5224330',
  transport: testTransport,
  integrations: [AWSLambdaIntegration],
});

const lambdaBootstrap = require.main;
let rapidRuntime = lambdaBootstrap.children[0].exports;
rapidRuntime.prototype = {
  postInvocationError: function(error, id, callback) {},
};

exports.handler = ${additionalLambdaPrelude.scenario} (event,callback) => {
  const context = {
    functionVersion: '$LATEST',
    functionName: 'aws-lambda-unit-test',
    awsRequestId: '95a31fc8-7490-4474-aa7d-951aca216381',
    getRemainingTimeInMillis: function getRemainingTimeInMillis() {
      return 3000;
    },
  };
  AWSLambdaIntegration.providedContext(context, ${additionalLambdaPrelude.timeoutWarning}, 2000);

  ${additionalLambdaPrelude.error}
};

exports.handler();
`;
  return lambdaPrelude;
}
