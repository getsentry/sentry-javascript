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
      // Inline string literal (not a variable) so we can assert it gets redacted out of `graphql.source`.
      await server.executeOperation({
        query: gql`
          mutation {
            login(email: "secret@example.com")
          }
        `,
      });

      setTimeout(() => {
        span.end();
        server.stop();
      }, 500);
    },
  );
}

run();
