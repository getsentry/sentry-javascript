// Loaded *after* `Sentry.init()` so the runtime module hooks are already installed when graphql is
// compiled. graphql is deliberately left out of the bundle (see build.mjs): if it were bundled there
// would be no module load left for the hook to intercept and the assertion would prove nothing.
const { buildSchema, parse, execute } = await import('graphql');

const schema = buildSchema('type Query { hello: String }');

export async function runQuery() {
  const document = parse('{ hello }');

  await execute({ schema, document, rootValue: { hello: () => 'world' } });
}
