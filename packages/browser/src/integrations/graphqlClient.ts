import { SEMANTIC_ATTRIBUTE_SENTRY_OP, defineIntegration, spanToJSON } from '@sentry/core';
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
        const spanJSON = spanToJSON(span);

        const spanAttributes = spanJSON.data || {};

        const spanOp = spanAttributes[SEMANTIC_ATTRIBUTE_SENTRY_OP];
        const isHttpClientSpan = spanOp === 'http.client';

        if (isHttpClientSpan) {
          const httpUrl = spanAttributes['http.url'];

          const { endpoints } = options;

          const isTracedGraphqlEndpoint = endpoints.includes(httpUrl);

          if (isTracedGraphqlEndpoint) {
            const httpMethod = spanAttributes['http.method'];
            const graphqlQuery = spanAttributes['body']?.query as string;

            const { operationName, operationType } = parseGraphQLQuery(graphqlQuery);
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
