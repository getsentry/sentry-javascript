import * as Sentry from '@sentry/node';
import gql from 'graphql-tag';

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
        query: gql`
          mutation Mutation($email: String) {
            login(email: $email)
          }
        `,
        // We want to trigger an error by passing an invalid variable type
        variables: { email: 123 },
      });

      setTimeout(() => {
        span.end();
        server.stop();
      }, 500);
    },
  );
}

run();
