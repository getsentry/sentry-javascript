interface GraphQLOperation {
  operationType: string | undefined;
  operationName: string | undefined;
}

/**
 * Extract the name and type of the operation from the GraphQL query.
 * @param query
 */
export function parseGraphQLQuery(query: string): GraphQLOperation {
  const queryRe = /^(?:\s*)(query|mutation|subscription)(?:\s*)(\w+)(?:\s*)[{(]/;

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

/**
 * Extract the payload of a request ONLY if it's GraphQL.
 * @param payload - A valid JSON string
 */
export function getGraphQLRequestPayload(payload: string): any | undefined {
  let graphqlBody = undefined;
  try {
    const requestBody = JSON.parse(payload);
    const isGraphQLRequest = !!requestBody['query'];
    if (isGraphQLRequest) {
      graphqlBody = requestBody;
    }
  } finally {
    // Fallback to undefined if payload is an invalid JSON (SyntaxError)

    /* eslint-disable no-unsafe-finally */
    return graphqlBody;
  }
}
