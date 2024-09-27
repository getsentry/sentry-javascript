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

interface GraphQLRequestPayload {
  query: string;
  operationName?: string;
  variables?: Record<string, any>;
}

const INTEGRATION_NAME = 'GraphQLClient';

const _graphqlClientIntegration = ((options: GraphQLClientOptions) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      client.on('outgoingRequestSpanStart', (span, { body }) => {
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
            const graphqlBody = body as GraphQLRequestPayload;

            // Standard graphql request shape: https://graphql.org/learn/serving-over-http/#post-request
            const graphqlQuery = graphqlBody.query;
            const graphqlOperationName = graphqlBody.operationName;

            const { operationName = graphqlOperationName, operationType } = parseGraphQLQuery(graphqlQuery);
            const newOperation = operationName ? `${operationType} ${operationName}` : `${operationType}`;

            span.updateName(`${httpMethod} ${httpUrl} (${newOperation})`);
            span.setAttribute('body', JSON.stringify(graphqlBody));
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
