// The workload the bundle instruments: a `graphql` query. Whether `graphql` is inlined into the
// bundle or kept external is decided per-variant by `build.mjs`.
import { buildSchema, graphql } from 'graphql';

const schema = buildSchema('type Query { hello: String }');

export async function runWorkload() {
  return graphql({ schema, source: '{ hello }', rootValue: { hello: () => 'world' } });
}
