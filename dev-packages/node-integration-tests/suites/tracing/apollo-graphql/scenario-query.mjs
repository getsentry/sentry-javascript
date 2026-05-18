import * as Sentry from '@sentry/node';

async function run() {
  const { createApolloServer } = await import('./apollo-server.mjs');
  const server = createApolloServer();

  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async span => {
      // Ref: https://www.apollographql.com/docs/apollo-server/testing/testing/#testing-using-executeoperation
      await server.executeOperation({
        query: '{hello}',
      });

      setTimeout(() => {
        span.end();
        server.stop();
      }, 500);
    },
  );
}

run();
