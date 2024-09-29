import {
  SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_URL_FULL,
  defineIntegration,
  spanToJSON,
} from '@sentry/core';
import type { Client, IntegrationFn } from '@sentry/types';
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
      _updateSpanWithGraphQLData(client, options);
      _updateBreadcrumbWithGraphQLData(client, options);
    },
  };
}) satisfies IntegrationFn;

function _updateSpanWithGraphQLData(client: Client, options: GraphQLClientOptions): void {
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

        const operationInfo = _getGraphQLOperation(body);
        span.updateName(`${httpMethod} ${httpUrl} (${operationInfo})`);
        span.setAttribute('body', JSON.stringify(body));
      }
    }
  });
}

function _updateBreadcrumbWithGraphQLData(client: Client, options: GraphQLClientOptions): void {
  client.on('outgoingRequestBreadcrumbStart', (breadcrumb, { body }) => {
    const { category, type, data } = breadcrumb;

    const isFetch = category === 'fetch';
    const isXhr = category === 'xhr';
    const isHttpBreadcrumb = type === 'http';

    if (isHttpBreadcrumb && (isFetch || isXhr)) {
      const httpUrl = data && data.url;
      const { endpoints } = options;

      const isTracedGraphqlEndpoint = endpoints.includes(httpUrl);

      if (isTracedGraphqlEndpoint && data) {
        if (!data.graphql) {
          const operationInfo = _getGraphQLOperation(body);

          data.graphql = {
            query: (body as GraphQLRequestPayload).query,
            operationName: operationInfo,
          };
        }

        // The body prop attached to HandlerDataFetch for the span should be removed.
        if (isFetch && data.body) {
          delete data.body;
        }
      }
    }
  });
}

function _getGraphQLOperation(requestBody: unknown): string {
  // Standard graphql request shape: https://graphql.org/learn/serving-over-http/#post-request
  const graphqlBody = requestBody as GraphQLRequestPayload;
  const graphqlQuery = graphqlBody.query;
  const graphqlOperationName = graphqlBody.operationName;

  const { operationName = graphqlOperationName, operationType } = parseGraphQLQuery(graphqlQuery);
  const operationInfo = operationName ? `${operationType} ${operationName}` : `${operationType}`;

  return operationInfo;
}

/**
 * GraphQL Client integration for the browser.
 */
export const graphqlClientIntegration = defineIntegration(_graphqlClientIntegration);
