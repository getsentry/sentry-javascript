import * as Sentry from '@sentry/node';
import gql from 'graphql-tag';

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
      // Ref: https://www.apollographql.com/docs/apollo-server/testing/testing/#testing-using-executeoperation
      await server.executeOperation({
        query: gql`
          mutation TestMutation($email: String) {
            login(email: $email)
          }
        `,
        variables: { email: 'test@email.com' },
      });

      setTimeout(() => {
        span.end();
        server.stop();
      }, 500);
    },
  );
}

run();
