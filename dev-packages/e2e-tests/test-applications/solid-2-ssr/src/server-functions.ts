import { buildSchema, graphql } from 'graphql';

export async function failingServerFunction(): Promise<void> {
  'use server';
  throw new Error('Error thrown from a server function in Solid 2 SSR E2E test app');
}

export async function graphqlServerFunction(): Promise<string> {
  'use server';
  const schema = buildSchema('type Query { hello: String }');
  const result = await graphql({ schema, source: 'query Hello { hello }', rootValue: { hello: () => 'world' } });
  return String(result.data?.hello);
}
