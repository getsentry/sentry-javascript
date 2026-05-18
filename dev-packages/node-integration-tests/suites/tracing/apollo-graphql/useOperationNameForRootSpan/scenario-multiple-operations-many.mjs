import * as Sentry from '@sentry/node';

const tracer = Sentry.getClient().tracer;

async function run() {
  const { createApolloServer } = await import('../../apollo-server.mjs');
  const server = createApolloServer();

  await tracer.startActiveSpan(
    'test span name',
    {
      kind: 1,
      attributes: { 'http.method': 'GET', 'http.route': '/test-graphql' },
    },
    async span => {
      for (let i = 1; i < 10; i++) {
        // Ref: https://www.apollographql.com/docs/apollo-server/testing/testing/#testing-using-executeoperation
        await server.executeOperation({
          query: `query GetHello${i} {hello}`,
        });
      }

      setTimeout(() => {
        span.end();
        server.stop();
      }, 500);
    },
  );
}

run();
