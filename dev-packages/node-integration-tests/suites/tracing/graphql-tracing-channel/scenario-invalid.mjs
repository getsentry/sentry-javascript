import * as Sentry from '@sentry/node';
import { graphql, GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql';

// Built programmatically (not via `buildSchema(sdl)`) so no `graphql:parse` fires at module load.
const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: { hello: { type: GraphQLString, resolve: () => 'world' } },
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
      // References a field that does not exist on the schema, so graphql fails at the validate step and
      // never executes. Validation returns errors without throwing, so the `graphql.validate` span must
      // still be flagged errored.
      await graphql({ schema, source: 'query Bad { doesNotExist }' });
    },
  );
}

run();
