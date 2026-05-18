import * as Sentry from '@sentry/node';

const tracer = Sentry.getClient().tracer;

async function run() {
  const { createApolloServer } = await import('../../apollo-server.mjs');
  const server = createApolloServer();

  await tracer.startActiveSpan('test span name', async span => {
    // Ref: https://www.apollographql.com/docs/apollo-server/testing/testing/#testing-using-executeoperation
    await server.executeOperation({
      query: 'query GetHello {hello}',
    });

    setTimeout(() => {
      span.end();
      server.stop();
    }, 500);
  });
}

run();
