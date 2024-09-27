import {
  SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_URL_FULL,
  defineIntegration,
  spanToJSON,
} from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { parseGraphQLQuery } from '@sentry/utils';

interface GraphQLClientOptions {
  endpoints: Array<string>;
}

const INTEGRATION_NAME = 'GraphQLClient';

const _graphqlClientIntegration = ((options: GraphQLClientOptions) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      client.on('spanStart', span => {
        client.emit('outgoingRequestSpanStart', span);
      });

      client.on('outgoingRequestSpanStart', span => {
        const spanJSON = spanToJSON(span);

        const spanAttributes = spanJSON.data || {};

        const spanOp = spanAttributes[SEMANTIC_ATTRIBUTE_SENTRY_OP];
        const isHttpClientSpan = spanOp === 'http.client';

        if (isHttpClientSpan) {
          const httpUrl = spanAttributes[SEMANTIC_ATTRIBUTE_URL_FULL] || spanAttributes['http.url'];

          const { endpoints } = options;
          const isTracedGraphqlEndpoint = endpoints.includes(httpUrl);

          if (isTracedGraphqlEndpoint) {
            const httpMethod = spanAttributes[SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD] || spanAttributes['http.method'];
            const graphqlBody = spanAttributes['body'];

            // Standard graphql request shape: https://graphql.org/learn/serving-over-http/#post-request
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const graphqlQuery = graphqlBody && (graphqlBody['query'] as string);

            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const graphqlOperationName = graphqlBody && (graphqlBody['operationName'] as string);

            const { operationName = graphqlOperationName, operationType } = parseGraphQLQuery(graphqlQuery);
            const newOperation = operationName ? `${operationType} ${operationName}` : `${operationType}`;

            span.updateName(`${httpMethod} ${httpUrl} (${newOperation})`);
          }
        }
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * GraphQL Client integration for the browser.
 */
export const graphqlClientIntegration = defineIntegration(_graphqlClientIntegration);
