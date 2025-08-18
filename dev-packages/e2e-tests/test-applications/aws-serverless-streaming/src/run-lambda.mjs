import { handler } from './lambda-function.mjs';
import { Writable } from 'node:stream';

const event = {};

const context = {
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123453789012:function:my-streaming-lambda',
  functionName: 'my-streaming-lambda',
};

const responseStream = new Writable({
  write: (chunk, encoding, callback) => {
    console.log('Streamed chunk:', chunk.toString());
    callback();
  },
});

await handler(event, responseStream, context);
