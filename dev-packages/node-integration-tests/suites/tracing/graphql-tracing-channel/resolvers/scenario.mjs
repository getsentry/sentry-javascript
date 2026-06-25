import * as Sentry from '@sentry/node';
import { graphql, GraphQLInt, GraphQLNonNull, GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql';

// Built programmatically (not via `buildSchema(sdl)`) so no `graphql:parse` fires at module load.
const UserType = new GraphQLObjectType({
  name: 'User',
  // `name` has no resolver, so it uses graphql's default property resolver (a "trivial" resolve).
  fields: { name: { type: GraphQLString } },
});

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      hello: { type: GraphQLString, resolve: () => 'world' },
      user: {
        type: UserType,
        args: { id: { type: new GraphQLNonNull(GraphQLInt) } },
        resolve: (_, { id }) => ({ name: `user-${id}` }),
      },
    },
  }),
});

async function run() {
  await new Promise(resolve => setTimeout(resolve, 100));

  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async () => {
      await graphql({ schema, source: '{ hello }' });
      await graphql({ schema, source: 'query GetUser { user(id: 1) { name } }' });
    },
  );
}

run();
