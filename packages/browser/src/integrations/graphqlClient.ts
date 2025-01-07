import { SENTRY_XHR_DATA_KEY } from '@sentry-internal/browser-utils';
import { getBodyString } from '@sentry-internal/replay';
import {
  SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_URL_FULL,
  defineIntegration,
  spanToJSON,
} from '@sentry/core';
import type { Client, HandlerDataFetch, HandlerDataXhr, IntegrationFn } from '@sentry/types';
import { getGraphQLRequestPayload, parseGraphQLQuery } from '@sentry/utils';

interface GraphQLClientOptions {
  endpoints: Array<string>;
}

// Standard graphql request shape: https://graphql.org/learn/serving-over-http/#post-request-and-body
interface GraphQLRequestPayload {
  query: string;
  operationName?: string;
  variables?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
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
  client.on('beforeOutgoingRequestSpan', (span, handlerData) => {
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
        
        const isXhr = 'xhr' in handlerData;
        const isFetch = 'fetchData' in handlerData;

        let body: string | undefined;

        if(isXhr){
          const sentryXhrData = (handlerData as HandlerDataXhr).xhr[SENTRY_XHR_DATA_KEY];
          body = getBodyString(sentryXhrData?.body)[0]

        } else if(isFetch){
          const sentryFetchData = (handlerData as HandlerDataFetch).fetchData
          body = getBodyString(sentryFetchData.body)[0]
        }

        const operationInfo = _getGraphQLOperation(getGraphQLRequestPayload(body as string) as GraphQLRequestPayload);
        span.updateName(`${httpMethod} ${httpUrl} (${operationInfo})`);
        span.setAttribute('graphql.document', body);
      }
    }
  });
}

function _updateBreadcrumbWithGraphQLData(client: Client, options: GraphQLClientOptions): void {
  client.on('beforeOutgoingRequestBreadcrumb', (breadcrumb, handlerData) => {
    const { category, type, data } = breadcrumb;

    const isFetch = category === 'fetch';
    const isXhr = category === 'xhr';
    const isHttpBreadcrumb = type === 'http';

    if (isHttpBreadcrumb && (isFetch || isXhr)) {
      const httpUrl = data && data.url;
      const { endpoints } = options;

      const isTracedGraphqlEndpoint = endpoints.includes(httpUrl);

      if (isTracedGraphqlEndpoint && data) {

        let body: string | undefined;
        
        if(isXhr){
          const sentryXhrData = (handlerData as HandlerDataXhr).xhr[SENTRY_XHR_DATA_KEY];
          body = getBodyString(sentryXhrData?.body)[0]

        } else if(isFetch){
          const sentryFetchData = (handlerData as HandlerDataFetch).fetchData
          body = getBodyString(sentryFetchData.body)[0]
        }
   
        const graphqlBody = getGraphQLRequestPayload(body as string)
        if (!data.graphql && graphqlBody) {
          const operationInfo = _getGraphQLOperation(graphqlBody as GraphQLRequestPayload);

          data.graphql = {
            query: (graphqlBody as GraphQLRequestPayload).query,
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

function _getGraphQLOperation(requestBody: GraphQLRequestPayload): string {
  const { query: graphqlQuery, operationName: graphqlOperationName } = requestBody

  const { operationName = graphqlOperationName, operationType } = parseGraphQLQuery(graphqlQuery);
  const operationInfo = operationName ? `${operationType} ${operationName}` : `${operationType}`;

  return operationInfo;
}

/**
 * GraphQL Client integration for the browser.
 */
export const graphqlClientIntegration = defineIntegration(_graphqlClientIntegration);
