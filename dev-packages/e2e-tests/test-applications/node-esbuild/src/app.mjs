// The real workload the bundle instruments: a `graphql` query. `graphql` is inlined into the bundle
// (only node builtins stay external), so the `plugin` build's orchestrion transform can rewrite it.
// graphql 16.x sits in the supported orchestrion range (`>=14.0.0 <17`).
import { buildSchema, graphql } from 'graphql';

const schema = buildSchema('type Query { hello: String }');

export async function runGraphqlQuery() {
  return graphql({ schema, source: '{ hello }', rootValue: { hello: () => 'world' } });
}
