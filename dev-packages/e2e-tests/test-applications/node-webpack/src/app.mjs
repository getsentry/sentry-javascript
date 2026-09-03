// The real workload the bundle instruments: a `graphql` query. Whether `graphql` is inlined into the
// bundle or kept external is decided per-variant by `build.mjs`; the `plugin` build's orchestrion
// transform rewrites the inlined copy. graphql 16.x sits in the supported orchestrion range
// (`>=14.0.0 <17`). The conventional `runWorkload` export lets the shared `entry.mjs` stay
// library-agnostic.
import { buildSchema, graphql } from 'graphql';

const schema = buildSchema('type Query { hello: String }');

export async function runWorkload() {
  return graphql({ schema, source: '{ hello }', rootValue: { hello: () => 'world' } });
}
