import * as Sentry from '@sentry/node';
import { GraphQLObjectType, GraphQLSchema, GraphQLString, graphql } from 'graphql';

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      hello: { type: GraphQLString, resolve: () => 'world' },
    },
  }),
});

async function run() {
  await new Promise(resolve => setTimeout(resolve, 100));

  await Sentry.startSpan({ name: 'Test Transaction', op: 'transaction' }, async () => {
    await graphql({ schema, source: 'query GetHello { hello }' });
  });
}

run();
