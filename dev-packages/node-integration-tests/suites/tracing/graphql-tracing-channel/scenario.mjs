import * as Sentry from '@sentry/node';
import {
  graphql,
  GraphQLBoolean,
  GraphQLInt,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from 'graphql';

// Build the schema programmatically rather than via `buildSchema(sdl)`: the SDL form parses at module
// load, which would publish a `graphql:parse` event outside any transaction (an orphan span).
const UserType = new GraphQLObjectType({
  name: 'User',
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
      boom: {
        type: GraphQLString,
        resolve: () => {
          throw new Error('resolver failed');
        },
      },
    },
  }),
  mutation: new GraphQLObjectType({
    name: 'Mutation',
    fields: {
      login: {
        type: GraphQLBoolean,
        args: { email: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_, { email }) => Boolean(email),
      },
    },
  }),
});

async function run() {
  // Let the integration's deferred channel subscription and OpenTelemetry's async-context setup
  // finish before issuing operations. In a real server graphql runs per-request, long after init;
  // here it would otherwise race init within the same tick.
  await new Promise(resolve => setTimeout(resolve, 100));

  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async () => {
      await graphql({ schema, source: '{ hello }' });
      await graphql({ schema, source: 'query GetUser { user(id: 42) { name } }' });
      // Inline literal carries a value, to assert it is redacted out of `graphql.document`.
      await graphql({ schema, source: 'mutation Login { login(email: "secret@example.com") }' });
      // A resolver throw surfaces as `result.errors`, which must flag the execute span as errored.
      await graphql({ schema, source: 'query Boom { boom }' });
    },
  );
}

run();
