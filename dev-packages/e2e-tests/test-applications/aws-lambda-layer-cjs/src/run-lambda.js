const { handle } = require('./lambda-function');
const event = {};
const context = {
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123453789012:function:my-lambda',
  functionName: 'my-lambda',
};
handle(event, context);
