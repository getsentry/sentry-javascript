import { handler } from './lambda-function.mjs';

// Simulate minimal event and context objects being passed to the handler by the AWS runtime
const event = {};
const context = {
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123453789012:function:my-lambda',
  functionName: 'my-lambda',
};

await handler(event, context);
