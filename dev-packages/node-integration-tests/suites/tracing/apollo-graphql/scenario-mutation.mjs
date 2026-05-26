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
