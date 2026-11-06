export const handler = awslambda.streamifyResponse(async (_event, responseStream) => {
  responseStream.write('app');
  responseStream.end();
});
