interface GraphQLOperation {
  operationType: string | undefined;
  operationName: string | undefined;
}

/**
 * Extract the name and type of the operation from the GraphQL query.
 * @param query
 * @returns
 */
export function parseGraphQLQuery(query: string): GraphQLOperation {
  const queryRe = /^(?:\s*)(query|mutation|subscription)(?:\s*)(\w+)(?:\s*)[\{\(]/;

  const matched = query.match(queryRe);

  if (matched) {
    return {
      operationType: matched[1],
      operationName: matched[2],
    };
  }
  return {
    operationType: undefined,
    operationName: undefined,
  };
}
