import * as Sentry from '@sentry/node';

async function run() {
  const { createApolloServer } = await import('../../apollo-server.mjs');
  const server = createApolloServer();

  await Sentry.startSpan({ name: 'Test Transaction', op: 'transaction' }, async span => {
    // Ref: https://www.apollographql.com/docs/apollo-server/testing/testing/#testing-using-executeoperation
    await server.executeOperation({ query: 'query GetHello {hello}' });
    await server.executeOperation({
      query: 'mutation TestMutation($email: String) { login(email: $email) }',
      variables: { email: 'test@email.com' },
    });

    setTimeout(() => {
      span.end();
      server.stop();
    }, 500);
  });
}

run();
